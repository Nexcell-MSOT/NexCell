-- ==============================================================================
-- NexCell Club Database Schema & Storage Architecture (Issue #26 & Issue #27)
-- Target Platform: Supabase (PostgreSQL 15+ & Supabase Storage)
-- Allowed Domains: https://nexcell.club, https://nexcell-msot.github.io, http://localhost:8000
-- ==============================================================================

-- 1. Enable UUID Extensions
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

-- Index for high-performance retrieval ordered by category and sequence
CREATE INDEX IF NOT EXISTS idx_media_category_sequence 
ON public.media_assets (category, sequence_order ASC);

-- Row Level Security (RLS) for media_assets
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Clean existing policies for idempotency
DROP POLICY IF EXISTS "Public Read Active Media" ON public.media_assets;
DROP POLICY IF EXISTS "Admin Full Access Media" ON public.media_assets;

-- Policy: Anyone can read active media assets (Public website display)
CREATE POLICY "Public Read Active Media"
ON public.media_assets
FOR SELECT
USING (is_active = TRUE);

-- Policy: Only authenticated club admins can insert/update/delete media assets
CREATE POLICY "Admin Full Access Media"
ON public.media_assets
FOR ALL
TO authenticated
USING (TRUE)
WITH CHECK (TRUE);


-- ==============================================================================
-- Table: event_submissions
-- Purpose: Securely stores form submissions with attached files (Issue #27)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.event_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_slug VARCHAR(100) NOT NULL,
    applicant_name VARCHAR(255) NOT NULL,
    applicant_email VARCHAR(255) NOT NULL,
    applicant_phone VARCHAR(50),
    team_name VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    uploaded_files JSONB DEFAULT '[]'::jsonb, -- Array of { fileName, filePath, fileUrl, mimeType, sizeBytes }
    status VARCHAR(50) DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'shortlisted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for fast lookup by event slug, applicant email, and date
CREATE INDEX IF NOT EXISTS idx_submissions_event_email 
ON public.event_submissions (event_slug, applicant_email);

CREATE INDEX IF NOT EXISTS idx_submissions_created_at
ON public.event_submissions (created_at DESC);

-- Row Level Security (RLS) for event_submissions
ALTER TABLE public.event_submissions ENABLE ROW LEVEL SECURITY;

-- Clean existing policies for idempotency
DROP POLICY IF EXISTS "Public Insert Event Submissions" ON public.event_submissions;
DROP POLICY IF EXISTS "Admin Read Event Submissions" ON public.event_submissions;
DROP POLICY IF EXISTS "Admin Update Event Submissions" ON public.event_submissions;
DROP POLICY IF EXISTS "Admin Delete Event Submissions" ON public.event_submissions;

-- Policy: Anyone (anon key or authenticated) can submit a form response with validation
CREATE POLICY "Public Insert Event Submissions"
ON public.event_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (
    applicant_name IS NOT NULL AND
    applicant_email IS NOT NULL AND
    event_slug IS NOT NULL
);

-- Policy: Only authenticated club admins can view submitted applications
CREATE POLICY "Admin Read Event Submissions"
ON public.event_submissions
FOR SELECT
TO authenticated
USING (TRUE);

-- Policy: Only authenticated club admins can update applicant status or reviewer notes
CREATE POLICY "Admin Update Event Submissions"
ON public.event_submissions
FOR UPDATE
TO authenticated
USING (TRUE)
WITH CHECK (TRUE);

-- Policy: Only authenticated club admins can delete submissions
CREATE POLICY "Admin Delete Event Submissions"
ON public.event_submissions
FOR DELETE
TO authenticated
USING (TRUE);


-- ==============================================================================
-- Storage Bucket Provisioning & Security Policies (Safe Idempotent Execution)
-- ==============================================================================
DO $$
BEGIN
  -- 1. Create Storage Buckets if storage schema exists (standard in Supabase)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES 
      (
        'public-assets', 
        'public-assets', 
        TRUE, 
        10485760, -- 10MB limit
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
      ),
      (
        'private-submissions', 
        'private-submissions', 
        FALSE, 
        15728640, -- 15MB limit
        ARRAY[
          'image/jpeg', 
          'image/png', 
          'application/pdf', 
          'application/msword', 
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]
      )
    ON CONFLICT (id) DO UPDATE SET 
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;

  -- 2. Storage RLS Security Policies on storage.objects
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies for idempotency
    DROP POLICY IF EXISTS "Public Assets Viewable by Everyone" ON storage.objects;
    DROP POLICY IF EXISTS "Admins Full Access Public Assets" ON storage.objects;
    DROP POLICY IF EXISTS "Allow Applicant Uploads to Submissions" ON storage.objects;
    DROP POLICY IF EXISTS "Admins Only View Submissions" ON storage.objects;
    DROP POLICY IF EXISTS "Admins Only Manage Submissions Files" ON storage.objects;

    -- Policy A: Public Assets Bucket - Readable by anyone (public website images)
    CREATE POLICY "Public Assets Viewable by Everyone"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'public-assets');

    -- Policy B: Public Assets Bucket - Managed only by authenticated admins
    CREATE POLICY "Admins Full Access Public Assets"
    ON storage.objects FOR ALL
    TO authenticated
    USING (bucket_id = 'public-assets')
    WITH CHECK (bucket_id = 'public-assets');

    -- Policy C: Private Submissions Bucket - Applicants can upload files
    CREATE POLICY "Allow Applicant Uploads to Submissions"
    ON storage.objects FOR INSERT
    TO anon, authenticated
    WITH CHECK (bucket_id = 'private-submissions');

    -- Policy D: Private Submissions Bucket - ONLY authenticated admins can read/download
    CREATE POLICY "Admins Only View Submissions"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'private-submissions');

    -- Policy E: Private Submissions Bucket - ONLY authenticated admins can delete/update
    CREATE POLICY "Admins Only Manage Submissions Files"
    ON storage.objects FOR ALL
    TO authenticated
    USING (bucket_id = 'private-submissions')
    WITH CHECK (bucket_id = 'private-submissions');
  END IF;
END $$;


-- ==============================================================================
-- Sample Seed Data for media_assets
-- ==============================================================================
INSERT INTO public.media_assets 
    (title, category, sequence_order, bucket_name, file_path, file_url, mime_type, file_size_bytes, alt_text, is_active)
VALUES 
    ('Ideathon 2026 Hero Banner', 'hero', 1, 'public-assets', 'hero/hero_ideathon.jpg', 'images/hero_ideathon.jpg', 'image/jpeg', 245000, 'NexCell Mirai 0 to 1 Ideathon Banner', TRUE),
    ('Founders Networking Dinner', 'hero', 2, 'public-assets', 'hero/hero_networking.jpg', 'images/hero_networking.jpg', 'image/jpeg', 312000, 'Founders Networking Session at NexCell', TRUE),
    ('Team Sip & Go - Winners', 'winners', 1, 'public-assets', 'winners/sip_and_go.jpg', 'images/winners/sip_and_go.jpg', 'image/jpeg', 189000, 'Team Sip & Go receiving 1st place at Ideathon', TRUE),
    ('Team Zero Margin - Runners Up', 'winners', 2, 'public-assets', 'winners/zero_margin.jpg', 'images/winners/zero_margin.jpg', 'image/jpeg', 204000, 'Team Zero Margin 2nd place winners', TRUE)
ON CONFLICT DO NOTHING;
