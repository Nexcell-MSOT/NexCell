-- ==============================================================================
-- NexCell Club Database Schema & Storage Architecture (Issue #26 & Issue #27)
-- Target Platform: Supabase (PostgreSQL 15+ & Supabase Storage)
-- Project: https://ejsrnuabenjqplxqswev.supabase.co
-- Allowed Domains: https://nexcell.club, https://nexcell-msot.github.io, http://localhost:8000
-- ==============================================================================

-- 1. Enable UUID & Cryptographic Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- Table: media_assets
-- Purpose: Manages sequenced images, documents, and media for nexcell.club
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('hero', 'team', 'winners', 'lookback', 'events')),
    sequence_order INT NOT NULL DEFAULT 0,
    bucket_name VARCHAR(100) NOT NULL DEFAULT 'public-assets',
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    alt_text TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_category_sequence 
ON public.media_assets (category, sequence_order ASC);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Active Media" ON public.media_assets;
DROP POLICY IF EXISTS "Admin Full Access Media" ON public.media_assets;

CREATE POLICY "Public Read Active Media"
ON public.media_assets FOR SELECT
USING (is_active = TRUE);

CREATE POLICY "Admin Full Access Media"
ON public.media_assets FOR ALL
TO authenticated
USING (TRUE)
WITH CHECK (TRUE);


-- ==============================================================================
-- Table: custom_forms
-- Purpose: Dynamic form definitions created and managed via Admin Panel
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.custom_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ,
    venue VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_paid BOOLEAN DEFAULT FALSE,
    fee_amount NUMERIC(10,2) DEFAULT 0.00,
    upi_id VARCHAR(100) DEFAULT 'nexcell@upi',
    upi_qr_url TEXT,
    fields JSONB NOT NULL DEFAULT '[]'::jsonb, 
    theme JSONB DEFAULT '{"accentColor": "#f39c12"}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_forms_slug ON public.custom_forms (slug);
CREATE INDEX IF NOT EXISTS idx_custom_forms_active ON public.custom_forms (is_active);

ALTER TABLE public.custom_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Active Forms" ON public.custom_forms;
DROP POLICY IF EXISTS "Admin Full Access Forms" ON public.custom_forms;

CREATE POLICY "Public Read Active Forms"
ON public.custom_forms FOR SELECT
USING (is_active = TRUE);

CREATE POLICY "Admin Full Access Forms"
ON public.custom_forms FOR ALL
TO authenticated
USING (TRUE)
WITH CHECK (TRUE);


-- ==============================================================================
-- Table: event_submissions
-- Purpose: Securely stores form submissions, UPI payments, and generated tickets
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.event_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID REFERENCES public.custom_forms(id) ON DELETE SET NULL,
    event_slug VARCHAR(100) NOT NULL,
    applicant_name VARCHAR(255) NOT NULL,
    applicant_email VARCHAR(255) NOT NULL,
    applicant_phone VARCHAR(50),
    team_name VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    uploaded_files JSONB DEFAULT '[]'::jsonb,
    payment_status VARCHAR(50) DEFAULT 'free' CHECK (payment_status IN ('free', 'pending_verification', 'verified', 'rejected')),
    payment_utr VARCHAR(100),
    payment_screenshot_url TEXT,
    ticket_code VARCHAR(100) UNIQUE,
    ticket_qr_data TEXT,
    admin_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'accepted', 'rejected', 'shortlisted')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_event_email 
ON public.event_submissions (event_slug, applicant_email);

CREATE INDEX IF NOT EXISTS idx_submissions_created_at
ON public.event_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_ticket_code
ON public.event_submissions (ticket_code);

ALTER TABLE public.event_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Insert Event Submissions" ON public.event_submissions;
DROP POLICY IF EXISTS "Public Read Own Ticket" ON public.event_submissions;
DROP POLICY IF EXISTS "Admin Read Event Submissions" ON public.event_submissions;
DROP POLICY IF EXISTS "Admin Update Event Submissions" ON public.event_submissions;
DROP POLICY IF EXISTS "Admin Delete Event Submissions" ON public.event_submissions;

CREATE POLICY "Public Insert Event Submissions"
ON public.event_submissions FOR INSERT
TO anon, authenticated
WITH CHECK (
    applicant_name IS NOT NULL AND
    applicant_email IS NOT NULL AND
    event_slug IS NOT NULL
);

CREATE POLICY "Public Read Own Ticket"
ON public.event_submissions FOR SELECT
TO anon, authenticated
USING (status = 'accepted' AND ticket_code IS NOT NULL);

CREATE POLICY "Admin Read Event Submissions"
ON public.event_submissions FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "Admin Update Event Submissions"
ON public.event_submissions FOR UPDATE
TO authenticated
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY "Admin Delete Event Submissions"
ON public.event_submissions FOR DELETE
TO authenticated
USING (TRUE);


-- ==============================================================================
-- Initial Seed Data: Default Forms & Media
-- ==============================================================================
-- Form 1: Mirai 0->1 Flagship Ideathon (Paid - 150 INR with Pitch Deck Upload)
INSERT INTO public.custom_forms (
    slug, title, description, event_date, venue, is_active, is_paid, fee_amount, upi_id, fields
) VALUES (
    'mirai-0-1-ideathon',
    'Mirai 0→1 Flagship Ideathon',
    'Pitch your startup prototype to angel investors and industry leaders. Cash prizes & direct incubation access.',
    '2026-11-15 09:30:00+05:30',
    'Auditorium, Rathinam Institute of Technology, Bangalore',
    TRUE,
    TRUE,
    150.00,
    'nexcell@upi',
    '[
        {"id": "applicant_name", "label": "Lead Applicant Name", "type": "text", "required": true, "placeholder": "e.g. Alex Rivera"},
        {"id": "applicant_email", "label": "Email Address", "type": "email", "required": true, "placeholder": "alex@college.edu"},
        {"id": "applicant_phone", "label": "Phone / WhatsApp", "type": "phone", "required": true, "placeholder": "+91 98765 43210"},
        {"id": "college_dept", "label": "College / Department & Year", "type": "text", "required": false, "placeholder": "e.g. 2nd Year CSE, RIT Bangalore"},
        {"id": "team_name", "label": "Startup / Team Name", "type": "text", "required": false, "placeholder": "e.g. Team Hyperion"},
        {"id": "idea_title", "label": "Idea / Startup Title", "type": "text", "required": true, "placeholder": "e.g. AgriSense IoT"},
        {"id": "idea_summary", "label": "Executive Summary & Problem Statement", "type": "textarea", "required": true, "placeholder": "Briefly describe what problem you are solving and your solution..."},
        {"id": "pitch_deck", "label": "Pitch Deck Presentation (PDF / DOCX)", "type": "file", "required": false, "placeholder": "Upload PDF"}
    ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Form 2: Founder Fireside & Networking Dinner (Free Entry)
INSERT INTO public.custom_forms (
    slug, title, description, event_date, venue, is_active, is_paid, fee_amount, upi_id, fields
) VALUES (
    'founder-fireside',
    'Founder Fireside & Networking Session',
    'An intimate evening with successful Bangalore startup founders. Limited priority passes available.',
    '2026-11-28 17:00:00+05:30',
    'Innovation Lab, Rathinam Campus',
    TRUE,
    FALSE,
    0.00,
    'nexcell@upi',
    '[
        {"id": "applicant_name", "label": "Full Name", "type": "text", "required": true, "placeholder": "Your full name"},
        {"id": "applicant_email", "label": "Email Address", "type": "email", "required": true, "placeholder": "your@email.com"},
        {"id": "applicant_phone", "label": "Phone / WhatsApp", "type": "phone", "required": true, "placeholder": "+91 98765 43210"},
        {"id": "interest_reason", "label": "Why do you want to attend?", "type": "textarea", "required": true, "placeholder": "Tell us what you hope to learn or who you want to meet..."}
    ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Seed media_assets
INSERT INTO public.media_assets 
    (title, category, sequence_order, bucket_name, file_path, file_url, mime_type, file_size_bytes, alt_text, is_active)
VALUES 
    ('Ideathon 2026 Hero Banner', 'hero', 1, 'public-assets', 'hero/hero_ideathon.jpg', 'images/hero_ideathon.jpg', 'image/jpeg', 245000, 'NexCell Mirai 0 to 1 Ideathon Banner', TRUE),
    ('Founders Networking Dinner', 'hero', 2, 'public-assets', 'hero/hero_networking.jpg', 'images/hero_networking.jpg', 'image/jpeg', 312000, 'Founders Networking Session at NexCell', TRUE),
    ('Team Sip & Go - Winners', 'winners', 1, 'public-assets', 'winners/sip_and_go.jpg', 'images/winners/sip_and_go.jpg', 'image/jpeg', 189000, 'Team Sip & Go receiving 1st place at Ideathon', TRUE),
    ('Team Zero Margin - Runners Up', 'winners', 2, 'public-assets', 'winners/zero_margin.jpg', 'images/winners/zero_margin.jpg', 'image/jpeg', 204000, 'Team Zero Margin 2nd place winners', TRUE)
ON CONFLICT DO NOTHING;


-- ==============================================================================
-- Storage Bucket Provisioning (Optional / Safe Execution)
-- Note: In Supabase, storage.objects already has RLS enabled by default.
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES 
      ('public-assets', 'public-assets', TRUE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
      ('private-submissions', 'private-submissions', FALSE, 15728640, ARRAY['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
    ON CONFLICT (id) DO UPDATE SET 
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Non-fatal: buckets can also be created via Supabase Storage UI
  RAISE NOTICE 'Storage buckets creation skipped or handled by dashboard.';
END $$;
