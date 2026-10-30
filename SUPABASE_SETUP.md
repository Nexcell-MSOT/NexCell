# NexCell Supabase Backend & Storage Architecture Guide

This guide provides end-to-end instructions for NexCell club administrators and developers to set up, configure, and maintain the Supabase backend (PostgreSQL database, Row Level Security, and Object Storage) for [nexcell.club](https://nexcell.club).

---

## 🏛️ Architecture Overview

The NexCell platform relies on Supabase as a headless backend-as-a-service to power dynamic features on our static GitHub Pages site:

```
┌────────────────────────────────────────────────────────┐
│             Frontend Client (GitHub Pages)             │
│  - nexcell.club                                        │
│  - events/apply.html (Form filler & pitch deck uploader)│
│  - js/supabaseClient.js                                │
└───────────────────────────┬────────────────────────────┘
                            │
               HTTPS / REST │ (Enforced CORS & Anon Key)
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Supabase Gateway                     │
│  - CORS Origins Restriction                            │
│  - Row Level Security (RLS) Enforcement                │
├───────────────────────────┬────────────────────────────┤
│   PostgreSQL Database     │   S3-Compatible Storage    │
│  - media_assets           │  - public-assets (Public)  │
│  - event_submissions      │  - private-submissions     │
│                           │    (Encrypted / Private)   │
└───────────────────────────┴────────────────────────────┘
```

---

## 🚀 Connected Supabase Project

- **Project ID:** `ejsrnuabenjqplxqswev`
- **Project URL:** `https://ejsrnuabenjqplxqswev.supabase.co`
- **Dashboard Link:** [https://supabase.com/dashboard/project/ejsrnuabenjqplxqswev](https://supabase.com/dashboard/project/ejsrnuabenjqplxqswev)

---

## 🗄️ Step 1: Run Database Migration in SQL Editor

1. Open your project's SQL Editor directly:  
   👉 **[https://supabase.com/dashboard/project/ejsrnuabenjqplxqswev/sql/new](https://supabase.com/dashboard/project/ejsrnuabenjqplxqswev/sql/new)**
2. Copy the entire contents of [`database/schema.sql`](file:///Users/sidd/Documents/nexcel-101/database/schema.sql) and paste them into the query editor.
3. Click the green **"Run"** button (or press `Cmd/Ctrl + Enter`).
4. You will see `Success. No rows returned.` In the Table Editor, you will now see:
   - `custom_forms` (with initial seed forms)
   - `event_submissions` (with UPI payment verification & ticket columns)
   - `media_assets`
   - Storage buckets: `public-assets` & `private-submissions`
   - `Success. No rows returned.`
   - Tables created:
     - `public.media_assets`
     - `public.event_submissions`
   - Indexes created:
     - `idx_media_category_sequence`
     - `idx_submissions_event_email`
     - `idx_submissions_created_at`
   - Storage buckets created:
     - `public-assets`
     - `private-submissions`
   - Row Level Security (RLS) policies successfully activated.

---

## 🪣 Step 3: Verify Storage Buckets & Policies

The migration script creates the buckets automatically. To verify or manually configure them in the UI:

1. Navigate to **Storage** in the left sidebar.
2. Ensure both buckets exist:
   
   | Bucket Name | Public? | Max File Size | Allowed MIME Types | Purpose |
   |:---|:---:|:---:|:---|:---|
   | **`public-assets`** | **Yes** (Public) | 10 MB | `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml` | Hero banners, event photos, winner spotlights |
   | **`private-submissions`** | **No** (Private) | 15 MB | `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/msword`, `image/png`, `image/jpeg` | Pitch decks, proposals, applicant files |

3. Confirm Storage Policies under **Storage > Policies**:
   - `public-assets`:
     - `Public Assets Viewable by Everyone`: SELECT allowed for all (`bucket_id = 'public-assets'`).
     - `Admins Full Access Public Assets`: ALL allowed for `authenticated` users only.
   - `private-submissions`:
     - `Allow Applicant Uploads to Submissions`: INSERT allowed for `anon, authenticated` (`bucket_id = 'private-submissions'`).
     - `Admins Only View Submissions`: SELECT allowed only for `authenticated` users.
     - `Admins Only Manage Submissions Files`: ALL allowed only for `authenticated` users.

> 🔒 **Security Guarantee:** Anonymous public users can only **upload** files to `private-submissions`. They **cannot** list, download, overwrite, or delete files submitted by other applicants.

---

## 🌐 Step 4: Configure CORS & Domain Restrictions

To prevent unauthorized third-party sites from querying our API, enforce origin restrictions:

1. In Supabase Dashboard, go to **Project Settings** (gear icon) > **API**.
2. Scroll to the **CORS Configuration** / **Allowed Web Origins** section.
3. Add the following allowed domains:
   ```
   https://nexcell.club
   https://nexcell-msot.github.io
   https://sapnilbiswas.github.io
   http://localhost:8000
   http://localhost:3000
   http://127.0.0.1:5500
   ```
4. Click **Save Changes**.

---

## 🔑 Step 5: Configure the Frontend Client

1. In Supabase Dashboard, go to **Project Settings** > **API**.
2. Locate the **Project API keys** and **Project URL**:
   - **Project URL:** e.g., `https://xyzcompany.supabase.co`
   - **anon / public key:** e.g., `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   
   > ⚠️ **CRITICAL SECURITY NOTE:**
   > - **USE:** The `anon` (public) key in client-side code. This is safe because Row Level Security strictly enforces permissions.
   > - **NEVER USE OR COMMIT:** The `service_role` key! The `service_role` key bypasses all RLS policies and grants full administrative rights. It must remain secret.

3. Open [`js/supabaseClient.js`](file:///Users/sidd/Documents/nexcel-101/js/supabaseClient.js):
   Update the `CONFIG` object around line 28:
   ```javascript
   const CONFIG = {
     url:
       (typeof window !== 'undefined' &&
         window.NEXCELL_SUPABASE_CONFIG &&
         window.NEXCELL_SUPABASE_CONFIG.url) ||
       'https://YOUR_ACTUAL_PROJECT_ID.supabase.co', // <-- INSERT YOUR SUPABASE URL HERE
     anonKey:
       (typeof window !== 'undefined' &&
         window.NEXCELL_SUPABASE_CONFIG &&
         window.NEXCELL_SUPABASE_CONFIG.anonKey) ||
       'YOUR_ACTUAL_ANON_PUBLIC_KEY',              // <-- INSERT YOUR ANON PUBLIC KEY HERE
     // ...
   };
   ```

4. Alternatively, you can configure the client dynamically in any HTML page header without editing the file:
   ```html
   <script>
     window.NEXCELL_SUPABASE_CONFIG = {
       url: 'https://YOUR_ACTUAL_PROJECT_ID.supabase.co',
       anonKey: 'YOUR_ACTUAL_ANON_PUBLIC_KEY'
     };
   </script>
   <script src="../js/supabaseClient.js"></script>
   ```

---

## 🧪 Step 6: Testing & Verification

### Test 1: Verify Anonymous Submissions Work
1. Start a local server:
   ```bash
   python3 -m http.server 8000
   ```
2. Open `http://localhost:8000/events/apply.html` in your browser.
3. Fill in the form fields:
   - **Event:** Mirai 0→1 Ideathon
   - **Name:** Jane Doe
   - **Email:** jane@rathinam.ac.in
   - **Upload:** Drag & drop a sample PDF deck (< 10MB)
4. Click **"Submit Application"**.
5. Check that the success screen appears with a submission reference ID (e.g. `#NEX-A1B2C3D4`).
6. In Supabase Dashboard > **Table Editor** > `event_submissions`, verify that Jane's submission row is present with the file metadata stored in `uploaded_files`.
7. In Supabase Dashboard > **Storage** > `private-submissions`, verify that the uploaded PDF is located in `jane_rathinam_ac_in/...`.

### Test 2: Verify RLS Blocks Public Access to Submissions
Open your browser console and test that anonymous users cannot read other people's submissions:
```javascript
const client = await window.NexcellSupabase.getClient();
const { data, error } = await client.from('event_submissions').select('*');
console.log('Data:', data); // Should return empty array [] due to RLS!
```

---

## 📊 Step 7: Club Admin Operations & Workflows

### 1. Reviewing Submitted Event Applications
- Open **Table Editor** > `event_submissions`.
- Admins can filter by `event_slug` (e.g. `mirai-0-1-ideathon`).
- To change application status, edit the `status` column directly:
  - `submitted`
  - `under_review`
  - `shortlisted`
  - `rejected`

### 2. Downloading Pitch Decks
- Because files in `private-submissions` are protected, admins can view and download them directly from the Supabase **Storage Explorer** by clicking the file and selecting **"Download"** or **"Get signed URL"**.

### 3. Adding New Media Assets (Website Carousels & Heroes)
- To add a new photo to the website:
  1. Upload the image file to **Storage** > `public-assets` into the appropriate folder (e.g. `hero/` or `winners/`).
  2. Copy the public URL.
  3. Go to **Table Editor** > `media_assets` and add a new row:
     - `title`: e.g. "Ideathon 2026 Winner"
     - `category`: `hero`, `team`, `winners`, `lookback`, or `events`
     - `sequence_order`: integer (1, 2, 3...)
     - `file_url`: the public URL or relative path
     - `is_active`: `TRUE`
  4. The frontend will automatically load and sequence it!
