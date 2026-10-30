/**
 * ==============================================================================
 * NexCell Club - Client-Side Supabase Service (Issue #26 & Issue #27)
 * ==============================================================================
 * Modular, dependency-safe vanilla JavaScript service for:
 * 1. Admin Authentication (Supabase Auth: signIn, signOut, session)
 * 2. Dynamic Form Builder & Renderer (custom_forms table)
 * 3. Event Submissions, UPI Payment Verification & QR Ticketing (event_submissions)
 * 4. Supabase Storage interactions (public-assets, private-submissions)
 * 5. Fallback demo mode when credentials are not configured or offline.
 *
 * Connected Project: https://ejsrnuabenjqplxqswev.supabase.co
 * Allowed Domains: https://nexcell.club, https://nexcell-msot.github.io, http://localhost:8000
 * ==============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NexcellSupabase = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ----------------------------------------------------------------------------
  // Configuration
  // ----------------------------------------------------------------------------
  const CONFIG = {
    url:
      (typeof window !== 'undefined' &&
        window.NEXCELL_SUPABASE_CONFIG &&
        window.NEXCELL_SUPABASE_CONFIG.url) ||
      'https://ejsrnuabenjqplxqswev.supabase.co',
    anonKey:
      (typeof window !== 'undefined' &&
        window.NEXCELL_SUPABASE_CONFIG &&
        window.NEXCELL_SUPABASE_CONFIG.anonKey) ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqc3JudWFiZW5qcXBseHFzd2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMTM0ODQsImV4cCI6MjEwODY4OTQ4NH0.gLlJCdYiJEgZJdS78vtPfDNsAVCms8C0XgLhwtZNWug',
    storage: {
      publicBucket: 'public-assets',
      submissionsBucket: 'private-submissions',
      maxUploadSizeBytes: 10 * 1024 * 1024, // 10 MB per file limit
      allowedMimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'image/png',
        'image/jpeg',
        'image/jpg',
      ],
      allowedExtensions: ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg'],
    },
  };

  let clientInstance = null;
  let supabaseScriptPromise = null;

  /**
   * Checks whether the Supabase configuration credentials have been set.
   * @returns {boolean}
   */
  function isConfigured() {
    return (
      Boolean(CONFIG.url) &&
      Boolean(CONFIG.anonKey) &&
      !CONFIG.url.includes('YOUR_PROJECT_ID') &&
      !CONFIG.anonKey.includes('YOUR_SUPABASE_ANON')
    );
  }

  /**
   * Dynamically loads @supabase/supabase-js from CDN if not already loaded in window.
   * @returns {Promise<any>}
   */
  function ensureSupabaseLoaded() {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('Browser environment required.'));
    }

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return Promise.resolve(window.supabase);
    }

    if (supabaseScriptPromise) {
      return supabaseScriptPromise;
    }

    supabaseScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-supabase-sdk]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.supabase));
        existingScript.addEventListener('error', (err) => reject(err));
        return;
      }

      const script = document.createElement('script');
      script.setAttribute('data-supabase-sdk', 'true');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.async = true;
      script.onload = () => {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
          resolve(window.supabase);
        } else {
          reject(new Error('Failed to initialize Supabase SDK from CDN.'));
        }
      };
      script.onerror = () => reject(new Error('Could not load Supabase script from CDN.'));
      document.head.appendChild(script);
    });

    return supabaseScriptPromise;
  }

  /**
   * Initializes or returns the cached Supabase client instance.
   * @returns {Promise<any|null>}
   */
  async function getClient() {
    if (clientInstance) {
      return clientInstance;
    }

    if (!isConfigured()) {
      console.warn(
        '[NexCell Supabase] Credentials not set. Running in preview/demo mode. See SUPABASE_SETUP.md.'
      );
      return null;
    }

    const supabaseSDK = await ensureSupabaseLoaded();
    clientInstance = supabaseSDK.createClient(CONFIG.url, CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });

    return clientInstance;
  }

  /**
   * Validates a candidate file against allowed MIME types, extensions, and size limits.
   * @param {File|object} file
   * @returns {{ valid: boolean, error?: string }}
   */
  function validateFile(file) {
    if (!file || typeof file !== 'object' || typeof file.size !== 'number' || typeof file.name !== 'string') {
      return { valid: false, error: 'A valid file object must be provided.' };
    }

    if (file.size <= 0) {
      return { valid: false, error: `File "${file.name}" is empty (0 bytes).` };
    }

    if (file.size > CONFIG.storage.maxUploadSizeBytes) {
      const maxMb = Math.round(CONFIG.storage.maxUploadSizeBytes / (1024 * 1024));
      const actualMb = (file.size / (1024 * 1024)).toFixed(2);
      return {
        valid: false,
        error: `File "${file.name}" (${actualMb} MB) exceeds maximum allowed size of ${maxMb} MB.`,
      };
    }

    const fileNameLower = file.name.toLowerCase();
    const hasValidExt = CONFIG.storage.allowedExtensions.some((ext) =>
      fileNameLower.endsWith(ext)
    );

    if (!hasValidExt) {
      return {
        valid: false,
        error: `File "${file.name}" has an unsupported format. Allowed: PDF, DOCX, DOC, PNG, JPG.`,
      };
    }

    if (file.type) {
      const mimeLower = file.type.toLowerCase();
      const isAllowedMime = CONFIG.storage.allowedMimeTypes.includes(mimeLower);
      const isGenericStream = mimeLower === 'application/octet-stream';
      const isOfficeDocument =
        mimeLower.includes('officedocument') ||
        mimeLower.includes('msword') ||
        mimeLower.includes('word');

      if (!isAllowedMime && !isGenericStream && !isOfficeDocument) {
        return {
          valid: false,
          error: `File "${file.name}" has an unsupported MIME type (${file.type}). Allowed: PDF, DOCX, DOC, PNG, JPG.`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Sanitizes a folder token for safe storage paths.
   */
  function sanitizePathToken(str) {
    return (str || 'anonymous')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]/g, '_')
      .substring(0, 40);
  }

  /**
   * Sanitizes a filename preserving its extension even for very long names.
   */
  function sanitizeFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') return 'upload.bin';
    const lastDotIndex = fileName.lastIndexOf('.');
    let namePart = lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
    let extPart = lastDotIndex !== -1 ? fileName.substring(lastDotIndex).toLowerCase() : '';

    namePart = namePart
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, '_')
      .substring(0, 45);

    extPart = extPart.replace(/[^a-z0-9.]/g, '');
    return `${namePart || 'file'}${extPart}`;
  }

  // ============================================================================
  // 1. Admin Authentication Services
  // ============================================================================

  /**
   * Signs in an admin user with email and password via Supabase Auth.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ user: object|null, session: object|null, error: object|null }>}
   */
  async function signInAdmin(email, password) {
    if (!email || !password) {
      return { user: null, session: null, error: new Error('Email and password are required.') };
    }

    try {
      const client = await getClient();
      if (!client) throw new Error('Supabase client failed to initialize.');

      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) return { user: null, session: null, error };
      return { user: data.user, session: data.session, error: null };
    } catch (err) {
      return { user: null, session: null, error: err };
    }
  }

  /**
   * Signs out the currently authenticated admin.
   */
  async function signOutAdmin() {
    try {
      const client = await getClient();
      if (!client) return { error: null };
      const { error } = await client.auth.signOut();
      return { error };
    } catch (err) {
      return { error: err };
    }
  }

  /**
   * Retrieves the current session if user is logged in.
   */
  async function getSession() {
    try {
      const client = await getClient();
      if (!client) return { session: null, error: null };
      const { data, error } = await client.auth.getSession();
      return { session: data ? data.session : null, error };
    } catch (err) {
      return { session: null, error: err };
    }
  }

  /**
   * Retrieves the current user profile.
   */
  async function getCurrentUser() {
    try {
      const client = await getClient();
      if (!client) return { user: null, error: null };
      const { data, error } = await client.auth.getUser();
      return { user: data ? data.user : null, error };
    } catch (err) {
      return { user: null, error: err };
    }
  }

  /**
   * Registers a listener for authentication state changes (e.g. login/logout).
   */
  async function onAuthStateChange(callback) {
    try {
      const client = await getClient();
      if (!client) return { data: { subscription: { unsubscribe: () => {} } } };
      return client.auth.onAuthStateChange(callback);
    } catch (err) {
      return { data: { subscription: { unsubscribe: () => {} } } };
    }
  }

  // ============================================================================
  // 2. Dynamic Form Builder Services (custom_forms)
  // ============================================================================

  /**
   * Fetches forms from custom_forms.
   * @param {boolean} activeOnly - If true, fetches only active forms
   */
  async function getForms(activeOnly = true) {
    if (!isConfigured()) {
      return { data: getMockForms(), error: null, isFallback: true };
    }

    try {
      const client = await getClient();
      if (!client) return { data: getMockForms(), error: null, isFallback: true };

      let query = client.from('custom_forms').select('*').order('created_at', { ascending: false });
      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[NexCell Supabase] getForms error:', error);
        return { data: getMockForms(), error, isFallback: true };
      }
      return { data: data || [], error: null };
    } catch (err) {
      return { data: getMockForms(), error: err, isFallback: true };
    }
  }

  /**
   * Fetches a specific form definition by its slug.
   * @param {string} slug
   */
  async function getFormBySlug(slug) {
    if (!slug) return { data: null, error: new Error('Slug is required.') };

    if (!isConfigured()) {
      const forms = getMockForms();
      const match = forms.find((f) => f.slug === slug);
      return { data: match || null, error: null, isFallback: true };
    }

    try {
      const client = await getClient();
      if (!client) return { data: null, error: new Error('Client not initialized.') };

      const { data, error } = await client
        .from('custom_forms')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (error) return { data: null, error };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  /**
   * Saves or updates a form definition in custom_forms (Admin only).
   * @param {object} formData
   */
  async function saveForm(formData) {
    if (!formData || !formData.title || !formData.slug) {
      return { success: false, error: 'Form title and slug are required.' };
    }

    try {
      const client = await getClient();
      if (!client) throw new Error('Client not initialized.');

      const payload = {
        title: formData.title.trim(),
        slug: formData.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        description: formData.description || null,
        event_date: formData.event_date || null,
        venue: formData.venue || null,
        is_active: formData.is_active !== false,
        is_paid: Boolean(formData.is_paid),
        fee_amount: Number(formData.fee_amount) || 0.0,
        upi_id: formData.upi_id || 'nexcell@upi',
        upi_qr_url: formData.upi_qr_url || null,
        fields: Array.isArray(formData.fields) ? formData.fields : [],
        theme: formData.theme || { accentColor: '#f39c12' },
        updated_at: new Date().toISOString(),
      };

      let result;
      if (formData.id) {
        // Update existing form
        result = await client.from('custom_forms').update(payload).eq('id', formData.id).select().single();
      } else {
        // Insert new form
        result = await client.from('custom_forms').insert([payload]).select().single();
      }

      if (result.error) return { success: false, error: result.error.message };
      return { success: true, data: result.data, error: null };
    } catch (err) {
      return { success: false, error: err.message || 'Error saving form.' };
    }
  }

  /**
   * Deletes a form by ID (Admin only).
   */
  async function deleteForm(formId) {
    if (!formId) return { success: false, error: 'Form ID required.' };
    try {
      const client = await getClient();
      if (!client) throw new Error('Client not initialized.');
      const { error } = await client.from('custom_forms').delete().eq('id', formId);
      if (error) return { success: false, error: error.message };
      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Toggles form active state.
   */
  async function toggleFormActive(formId, isActive) {
    try {
      const client = await getClient();
      if (!client) throw new Error('Client not initialized.');
      const { data, error } = await client
        .from('custom_forms')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', formId)
        .select()
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data, error: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ============================================================================
  // 3. Submissions, Review (Accept/Reject), & QR Ticketing
  // ============================================================================

  /**
   * Fetches submissions (Admin only).
   * @param {{ eventSlug?: string, status?: string }} filters
   */
  async function getSubmissions(filters = {}) {
    try {
      const client = await getClient();
      if (!client) throw new Error('Client not initialized.');

      let query = client.from('event_submissions').select('*').order('created_at', { ascending: false });

      if (filters.eventSlug) {
        query = query.eq('event_slug', filters.eventSlug);
      }
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) return { data: [], error };
      return { data: data || [], error: null };
    } catch (err) {
      return { data: [], error: err };
    }
  }

  /**
   * Accepts an application: generates a unique ticket code, sets status to 'accepted',
   * and prepares QR verification data.
   * @param {string} submissionId
   * @param {object} [options]
   */
  async function acceptSubmission(submissionId, options = {}) {
    if (!submissionId) return { success: false, error: 'Submission ID required.' };

    try {
      const client = await getClient();
      if (!client) throw new Error('Client not initialized.');

      // 1. Fetch current submission
      const { data: sub, error: fetchErr } = await client
        .from('event_submissions')
        .select('*')
        .eq('id', submissionId)
        .single();

      if (fetchErr || !sub) {
        return { success: false, error: 'Submission not found.' };
      }

      // 2. Generate unique ticket code
      const slugPrefix = (sub.event_slug || 'NEX')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 5)
        .toUpperCase();
      const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
      const ticketCode = `NEX-${slugPrefix}-${randomSuffix}`;

      // 3. Build QR Code payload (direct URL to ticket presentation page)
      const ticketUrl = `https://nexcell.club/events/ticket.html?code=${ticketCode}`;
      const qrData = JSON.stringify({
        ticket: ticketCode,
        applicant: sub.applicant_name,
        email: sub.applicant_email,
        event: sub.event_slug,
        issuedAt: new Date().toISOString(),
        url: ticketUrl,
      });

      // 4. Update in database
      const updatePayload = {
        status: 'accepted',
        payment_status: sub.payment_status === 'free' ? 'free' : 'verified',
        ticket_code: ticketCode,
        ticket_qr_data: qrData,
        admin_notes: options.adminNotes || 'Application accepted & confirmed.',
        reviewed_at: new Date().toISOString(),
      };

      const { data, error } = await client
        .from('event_submissions')
        .update(updatePayload)
        .eq('id', submissionId)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return {
        success: true,
        data,
        ticketCode,
        ticketUrl,
        qrData,
        error: null,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Rejects an application with optional feedback / reason.
   * @param {string} submissionId
   * @param {string} reason
   */
  async function rejectSubmission(submissionId, reason = '') {
    if (!submissionId) return { success: false, error: 'Submission ID required.' };

    try {
      const client = await getClient();
      if (!client) throw new Error('Client not initialized.');

      const updatePayload = {
        status: 'rejected',
        admin_notes: reason || 'Application not accepted for this cohort.',
        reviewed_at: new Date().toISOString(),
      };

      const { data, error } = await client
        .from('event_submissions')
        .update(updatePayload)
        .eq('id', submissionId)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data, error: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Retrieves ticket details by ticket_code (Publicly accessible for accepted tickets).
   * @param {string} ticketCode
   */
  async function getTicketByCode(ticketCode) {
    if (!ticketCode) return { data: null, error: new Error('Ticket code required.') };

    try {
      const client = await getClient();
      if (!client) throw new Error('Client not initialized.');

      const { data, error } = await client
        .from('event_submissions')
        .select('id, event_slug, applicant_name, applicant_email, team_name, details, ticket_code, ticket_qr_data, status, created_at')
        .eq('ticket_code', ticketCode.trim().toUpperCase())
        .eq('status', 'accepted')
        .maybeSingle();

      if (error) return { data: null, error };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // ============================================================================
  // 4. Media & Storage Services
  // ============================================================================

  /**
   * Fetches active media assets ordered by sequence_order ASC.
   */
  async function getMediaByCategory(category) {
    const validCategories = ['hero', 'team', 'winners', 'lookback', 'events'];
    if (!category || !validCategories.includes(category)) {
      return {
        data: [],
        error: new Error(`Invalid category "${category}". Must be one of: ${validCategories.join(', ')}`),
      };
    }

    try {
      const client = await getClient();
      if (!client) return { data: getMockMedia(category), error: null, isFallback: true };

      const { data, error } = await client
        .from('media_assets')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('sequence_order', { ascending: true });

      if (error) {
        console.error('[NexCell Supabase] getMediaByCategory error:', error);
        return { data: getMockMedia(category), error, isFallback: true };
      }

      return { data: data || [], error: null };
    } catch (err) {
      return { data: getMockMedia(category), error: err, isFallback: true };
    }
  }

  /**
   * Uploads file to private-submissions bucket.
   */
  async function uploadSubmissionFile(file, applicantEmail) {
    const validation = validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const emailPrefix = sanitizePathToken(applicantEmail || 'applicant');
    const safeFileName = sanitizeFileName(file.name);
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const storagePath = `${emailPrefix}/${timestamp}_${randomSuffix}_${safeFileName}`;

    try {
      const client = await getClient();
      if (!client) throw new Error('Supabase client failed to initialize.');

      const { data, error } = await client.storage
        .from(CONFIG.storage.submissionsBucket)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) {
        console.error('[NexCell Supabase] File upload failed:', error);
        return { success: false, error: error.message || 'Storage upload error.' };
      }

      return {
        success: true,
        path: data.path,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        error: null,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Network error while uploading file.',
      };
    }
  }

  /**
   * Submits event application with dynamic fields and payment metadata.
   */
  async function submitEventApplication(formData, files = [], options = {}) {
    if (!formData) return { success: false, error: 'Form data is required.' };
    if (!formData.event_slug || !formData.event_slug.trim()) {
      return { success: false, error: 'Event selection is required.' };
    }
    if (!formData.applicant_name || !formData.applicant_name.trim()) {
      return { success: false, error: 'Applicant name is required.' };
    }
    if (!formData.applicant_email || !formData.applicant_email.trim()) {
      return { success: false, error: 'Applicant email is required.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.applicant_email.trim())) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    // Pre-validate files
    const fileList = Array.isArray(files) ? files : Array.from(files || []);
    for (const f of fileList) {
      const check = validateFile(f);
      if (!check.valid) return { success: false, error: check.error };
    }

    // Upload files
    const uploadedFilesMeta = [];
    const totalFiles = fileList.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = fileList[i];
      if (typeof options.onFileProgress === 'function') {
        options.onFileProgress(i + 1, totalFiles, file.name);
      }

      const uploadResult = await uploadSubmissionFile(file, formData.applicant_email);
      if (!uploadResult.success) {
        return {
          success: false,
          error: `Upload failed for "${file.name}": ${uploadResult.error}`,
        };
      }

      uploadedFilesMeta.push({
        fileName: uploadResult.fileName,
        filePath: uploadResult.path,
        mimeType: uploadResult.mimeType,
        sizeBytes: uploadResult.sizeBytes,
        uploadedAt: new Date().toISOString(),
      });
    }

    // Prepare payload
    const submissionPayload = {
      form_id: formData.form_id || null,
      event_slug: formData.event_slug.trim(),
      applicant_name: formData.applicant_name.trim(),
      applicant_email: formData.applicant_email.trim().toLowerCase(),
      applicant_phone: formData.applicant_phone ? formData.applicant_phone.trim() : null,
      team_name: formData.team_name ? formData.team_name.trim() : null,
      details: formData.details || {},
      uploaded_files: uploadedFilesMeta,
      payment_status: formData.payment_status || 'free',
      payment_utr: formData.payment_utr ? formData.payment_utr.trim() : null,
      payment_screenshot_url: formData.payment_screenshot_url || null,
      status: 'submitted',
    };

    // Generate UUID client-side so we have the ID without needing SELECT permissions on private table
    function generateUuid() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    const submissionId = generateUuid();
    submissionPayload.id = submissionId;

    try {
      const client = await getClient();
      if (!client) throw new Error('Supabase client could not be loaded.');

      // Insert without selecting representation so anonymous RLS policies allow insertion cleanly
      const { error } = await client
        .from('event_submissions')
        .insert([submissionPayload]);

      if (error) {
        console.error('[NexCell Supabase] Insert error:', error);
        return {
          success: false,
          error: error.message || 'Database error while saving your application.',
        };
      }

      return {
        success: true,
        submissionId: submissionId,
        data: submissionPayload,
        uploadedFiles: uploadedFilesMeta,
        error: null,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'An unexpected error occurred during submission.',
      };
    }
  }

  // ============================================================================
  // Fallback Mock Data
  // ============================================================================
  function getMockForms() {
    return [
      {
        id: 'mock-form-1',
        slug: 'mirai-0-1-ideathon',
        title: 'Mirai 0→1 Flagship Ideathon',
        description: 'Pitch your startup prototype to angel investors and industry leaders.',
        event_date: '2026-11-15T09:30:00Z',
        venue: 'Auditorium, Rathinam Institute of Technology, Bangalore',
        is_active: true,
        is_paid: true,
        fee_amount: 150.0,
        upi_id: 'nexcell@upi',
        fields: [
          { id: 'applicant_name', label: 'Lead Applicant Name', type: 'text', required: true, placeholder: 'e.g. Alex Rivera' },
          { id: 'applicant_email', label: 'Email Address', type: 'email', required: true, placeholder: 'alex@college.edu' },
          { id: 'applicant_phone', label: 'Phone / WhatsApp', type: 'phone', required: true, placeholder: '+91 98765 43210' },
          { id: 'team_name', label: 'Team Name', type: 'text', required: false, placeholder: 'e.g. Team Hyperion' },
          { id: 'idea_title', label: 'Startup Title', type: 'text', required: true, placeholder: 'e.g. AgriSense IoT' },
          { id: 'idea_summary', label: 'Executive Summary', type: 'textarea', required: true, placeholder: 'Problem & Solution summary' },
          { id: 'pitch_deck', label: 'Pitch Deck (PDF / DOCX)', type: 'file', required: false },
        ],
      },
      {
        id: 'mock-form-2',
        slug: 'founder-fireside',
        title: 'Founder Fireside & Networking Session',
        description: 'An intimate evening with successful Bangalore startup founders.',
        event_date: '2026-11-28T17:00:00Z',
        venue: 'Innovation Lab, Rathinam Campus',
        is_active: true,
        is_paid: false,
        fee_amount: 0.0,
        upi_id: 'nexcell@upi',
        fields: [
          { id: 'applicant_name', label: 'Full Name', type: 'text', required: true, placeholder: 'Your name' },
          { id: 'applicant_email', label: 'Email Address', type: 'email', required: true, placeholder: 'your@email.com' },
          { id: 'applicant_phone', label: 'Phone / WhatsApp', type: 'phone', required: true, placeholder: '+91 98765 43210' },
          { id: 'interest_reason', label: 'Why do you want to attend?', type: 'textarea', required: true },
        ],
      },
    ];
  }

  function getMockMedia(category) {
    const mockRegistry = {
      hero: [
        { id: 'mock-hero-1', title: 'NexCell Ideathon Banner', category: 'hero', sequence_order: 1, file_url: 'images/hero_ideathon.jpg' },
        { id: 'mock-hero-2', title: 'Founders Networking Session', category: 'hero', sequence_order: 2, file_url: 'images/hero_networking.jpg' },
      ],
      winners: [
        { id: 'mock-win-1', title: 'Team Sip & Go - Winners', category: 'winners', sequence_order: 1, file_url: 'images/winners/sip_and_go.jpg' },
        { id: 'mock-win-2', title: 'Team Zero Margin - Runners Up', category: 'winners', sequence_order: 2, file_url: 'images/winners/zero_margin.jpg' },
      ],
      lookback: [
        { id: 'mock-lb-1', title: 'Ideathon Moment 1', category: 'lookback', sequence_order: 1, file_url: 'images/lookback/crousal_image.jpg' },
        { id: 'mock-lb-2', title: 'Ideathon Moment 2', category: 'lookback', sequence_order: 2, file_url: 'images/lookback/crousal_image2.jpg' },
      ],
      team: [
        { id: 'mock-team-1', title: 'Core Leadership Team', category: 'team', sequence_order: 1, file_url: 'images/hero_1.png' },
      ],
      events: [
        { id: 'mock-event-1', title: 'Flagship Ideathon', category: 'events', sequence_order: 1, file_url: 'images/hero_2.png' },
      ],
    };
    return mockRegistry[category] || [];
  }

  function getConfigStatus() {
    return {
      isConfigured: isConfigured(),
      url: CONFIG.url,
      bucketSubmissions: CONFIG.storage.submissionsBucket,
      bucketPublic: CONFIG.storage.publicBucket,
      maxSizeBytes: CONFIG.storage.maxUploadSizeBytes,
    };
  }

  function configure(options) {
    if (!options || typeof options !== 'object') return;
    if (options.url) CONFIG.url = options.url.trim();
    if (options.anonKey) CONFIG.anonKey = options.anonKey.trim();
    clientInstance = null;
  }

  return {
    isConfigured,
    getConfigStatus,
    configure,
    getClient,
    ensureSupabaseLoaded,
    validateFile,
    // Admin Auth
    signInAdmin,
    signOutAdmin,
    getSession,
    getCurrentUser,
    onAuthStateChange,
    // Dynamic Forms
    getForms,
    getFormBySlug,
    saveForm,
    deleteForm,
    toggleFormActive,
    // Submissions, Review, & Ticketing
    getSubmissions,
    acceptSubmission,
    rejectSubmission,
    getTicketByCode,
    submitEventApplication,
    // Storage & Media
    uploadSubmissionFile,
    getMediaByCategory,
  };
});
