/**
 * ==============================================================================
 * NexCell Club - Client-Side Supabase Service (Issue #26 & Issue #27)
 * ==============================================================================
 * Modular, dependency-safe vanilla JavaScript service for:
 * 1. Database operations (media_assets, event_submissions)
 * 2. Supabase Storage interactions (public-assets, private-submissions)
 * 3. Graceful fallback / demo mode when credentials are not yet configured.
 *
 * Domain Restrictions & Origins:
 * - https://nexcell.club
 * - https://nexcell-msot.github.io
 * - http://localhost:8000
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
  // Club Admins: Replace placeholder values below or define
  // window.NEXCELL_SUPABASE_CONFIG before this script is loaded.
  // ----------------------------------------------------------------------------
  const CONFIG = {
    url:
      (typeof window !== 'undefined' &&
        window.NEXCELL_SUPABASE_CONFIG &&
        window.NEXCELL_SUPABASE_CONFIG.url) ||
      'https://YOUR_PROJECT_ID.supabase.co',
    anonKey:
      (typeof window !== 'undefined' &&
        window.NEXCELL_SUPABASE_CONFIG &&
        window.NEXCELL_SUPABASE_CONFIG.anonKey) ||
      'YOUR_SUPABASE_ANON_KEY',
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
      // Check if script tag already exists
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
        '[NexCell Supabase] Credentials not set. Running in preview/demo mode. See SUPABASE_SETUP.md to connect live database.'
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
      const isOfficeDocument = mimeLower.includes('officedocument') || mimeLower.includes('msword') || mimeLower.includes('word');

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
   * Sanitizes a folder token for safe storage paths (removes special characters and whitespace).
   * @param {string} str
   * @returns {string}
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
   * @param {string} fileName
   * @returns {string}
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
  // Public Service API
  // ============================================================================

  /**
   * Helper 1: Fetches active media assets ordered by sequence_order ASC.
   * @param {'hero'|'team'|'winners'|'lookback'|'events'} category
   * @returns {Promise<{ data: Array<object>, error: object|null, isFallback?: boolean }>}
   */
  async function getMediaByCategory(category) {
    const validCategories = ['hero', 'team', 'winners', 'lookback', 'events'];
    if (!category || !validCategories.includes(category)) {
      return {
        data: [],
        error: new Error(`Invalid category "${category}". Must be one of: ${validCategories.join(', ')}`),
      };
    }

    // Graceful fallback if credentials are not configured yet
    if (!isConfigured()) {
      return {
        data: getMockMedia(category),
        error: null,
        isFallback: true,
      };
    }

    try {
      const client = await getClient();
      if (!client) {
        return { data: getMockMedia(category), error: null, isFallback: true };
      }

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
      console.error('[NexCell Supabase] Unexpected getMediaByCategory failure:', err);
      return { data: getMockMedia(category), error: err, isFallback: true };
    }
  }

  /**
   * Helper 2: Validates file type, checks 10MB limit, and uploads to private-submissions bucket.
   * @param {File} file - The file to upload
   * @param {string} applicantEmail - The email of the applicant for sub-folder namespacing
   * @returns {Promise<{ success: boolean, path?: string, fileName?: string, mimeType?: string, sizeBytes?: number, error?: string, isMock?: boolean }>}
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

    // Demo / fallback mode if Supabase credentials are not set
    if (!isConfigured()) {
      await new Promise((resolve) => setTimeout(resolve, 350)); // simulate brief network activity
      return {
        success: true,
        path: `mock-submissions/${storagePath}`,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        isMock: true,
        error: null,
      };
    }

    try {
      const client = await getClient();
      if (!client) {
        throw new Error('Supabase client failed to initialize.');
      }

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
      console.error('[NexCell Supabase] Unexpected upload error:', err);
      return {
        success: false,
        error: err.message || 'Network error while uploading file.',
      };
    }
  }

  /**
   * Helper 3: Atomic-like event submission linking uploaded file metadata to event_submissions table.
   * @param {object} formData - Object containing form fields:
   *   - event_slug (string, required)
   *   - applicant_name (string, required)
   *   - applicant_email (string, required)
   *   - applicant_phone (string, optional)
   *   - team_name (string, optional)
   *   - details (object, optional additional metadata: ideaTitle, description, college, year, links)
   * @param {Array<File>} files - Array of File objects to validate and upload
   * @param {object} [options] - Optional settings:
   *   - onFileProgress: callback(current, total, fileName)
   * @returns {Promise<{ success: boolean, submissionId?: string, data?: object, uploadedFiles?: Array<object>, error?: string, isDemo?: boolean }>}
   */
  async function submitEventApplication(formData, files = [], options = {}) {
    // 1. Mandatory input validation
    if (!formData) {
      return { success: false, error: 'Form data is required.' };
    }
    if (!formData.event_slug || typeof formData.event_slug !== 'string' || !formData.event_slug.trim()) {
      return { success: false, error: 'Event selection is required.' };
    }
    if (!formData.applicant_name || typeof formData.applicant_name !== 'string' || !formData.applicant_name.trim()) {
      return { success: false, error: 'Applicant name is required.' };
    }
    if (!formData.applicant_email || typeof formData.applicant_email !== 'string' || !formData.applicant_email.trim()) {
      return { success: false, error: 'Applicant email is required.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.applicant_email.trim())) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    // 2. Pre-validate all files BEFORE starting any upload
    const fileList = Array.isArray(files) ? files : Array.from(files || []);
    for (const f of fileList) {
      const check = validateFile(f);
      if (!check.valid) {
        return { success: false, error: check.error };
      }
    }

    // 3. Upload files sequentially or with progress tracking
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

    // 4. Construct payload for event_submissions
    const submissionPayload = {
      event_slug: formData.event_slug.trim(),
      applicant_name: formData.applicant_name.trim(),
      applicant_email: formData.applicant_email.trim().toLowerCase(),
      applicant_phone: formData.applicant_phone ? formData.applicant_phone.trim() : null,
      team_name: formData.team_name ? formData.team_name.trim() : null,
      details: formData.details || {},
      uploaded_files: uploadedFilesMeta,
      status: 'submitted',
    };

    // 5. Insert into Supabase table (or return graceful demo response)
    if (!isConfigured()) {
      console.info('[NexCell Supabase] Simulated submission completed:', submissionPayload);
      return {
        success: true,
        submissionId: 'demo-' + Math.random().toString(36).substring(2, 10),
        data: submissionPayload,
        uploadedFiles: uploadedFilesMeta,
        isDemo: true,
        message: 'Demo submission recorded. Connect Supabase credentials to store permanently in PostgreSQL.',
      };
    }

    try {
      const client = await getClient();
      if (!client) {
        throw new Error('Supabase client could not be loaded.');
      }

      const { data, error } = await client
        .from('event_submissions')
        .insert([submissionPayload])
        .select()
        .single();

      if (error) {
        console.error('[NexCell Supabase] Insert error:', error);
        return {
          success: false,
          error: error.message || 'Database error while saving your application.',
        };
      }

      return {
        success: true,
        submissionId: data.id,
        data,
        uploadedFiles: uploadedFilesMeta,
        error: null,
      };
    } catch (err) {
      console.error('[NexCell Supabase] Application submission exception:', err);
      return {
        success: false,
        error: err.message || 'An unexpected error occurred during submission.',
      };
    }
  }

  /**
   * Returns fallback/mock media when the database is in demo or offline mode.
   * @param {string} category
   * @returns {Array<object>}
   */
  function getMockMedia(category) {
    const mockRegistry = {
      hero: [
        {
          id: 'mock-hero-1',
          title: 'NexCell Ideathon Banner',
          category: 'hero',
          sequence_order: 1,
          file_url: 'images/hero_ideathon.jpg',
          alt_text: 'Ideathon 2026',
        },
        {
          id: 'mock-hero-2',
          title: 'Founders Networking Session',
          category: 'hero',
          sequence_order: 2,
          file_url: 'images/hero_networking.jpg',
          alt_text: 'Networking Night',
        },
      ],
      winners: [
        {
          id: 'mock-win-1',
          title: 'Team Sip & Go - Ideathon Winners',
          category: 'winners',
          sequence_order: 1,
          file_url: 'images/winners/sip_and_go.jpg',
          alt_text: 'Team Sip & Go',
        },
        {
          id: 'mock-win-2',
          title: 'Team Zero Margin - Runners Up',
          category: 'winners',
          sequence_order: 2,
          file_url: 'images/winners/zero_margin.jpg',
          alt_text: 'Team Zero Margin',
        },
      ],
      lookback: [
        {
          id: 'mock-lb-1',
          title: 'Ideathon Moment 1',
          category: 'lookback',
          sequence_order: 1,
          file_url: 'images/lookback/crousal_image.jpg',
          alt_text: 'Pitching ideas',
        },
        {
          id: 'mock-lb-2',
          title: 'Ideathon Moment 2',
          category: 'lookback',
          sequence_order: 2,
          file_url: 'images/lookback/crousal_image2.jpg',
          alt_text: 'Team discussions',
        },
      ],
      team: [
        {
          id: 'mock-team-1',
          title: 'Core Leadership Team',
          category: 'team',
          sequence_order: 1,
          file_url: 'images/hero_1.png',
          alt_text: 'NexCell Core Team',
        },
      ],
      events: [
        {
          id: 'mock-event-1',
          title: 'Flagship Ideathon',
          category: 'events',
          sequence_order: 1,
          file_url: 'images/hero_2.png',
          alt_text: 'Flagship Event',
        },
      ],
    };

    return mockRegistry[category] || [];
  }

  /**
   * Helper to inspect the configuration status.
   * @returns {{ isConfigured: boolean, url: string, bucketSubmissions: string, bucketPublic: string, maxSizeBytes: number }}
   */
  function getConfigStatus() {
    return {
      isConfigured: isConfigured(),
      url: isConfigured() ? CONFIG.url : 'Not Configured (Demo Mode)',
      bucketSubmissions: CONFIG.storage.submissionsBucket,
      bucketPublic: CONFIG.storage.publicBucket,
      maxSizeBytes: CONFIG.storage.maxUploadSizeBytes,
    };
  }

  /**
   * Allows programmatic configuration at runtime.
   * @param {{ url: string, anonKey: string }} options
   */
  function configure(options) {
    if (!options || typeof options !== 'object') return;
    if (options.url) CONFIG.url = options.url.trim();
    if (options.anonKey) CONFIG.anonKey = options.anonKey.trim();
    clientInstance = null; // reset cached instance
  }

  return {
    isConfigured,
    getConfigStatus,
    configure,
    getClient,
    ensureSupabaseLoaded,
    validateFile,
    getMediaByCategory,
    uploadSubmissionFile,
    submitEventApplication,
  };
});
