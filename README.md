# NexCell

NexCell is an entrepreneurship club website for students interested in innovation, startups, prototyping, and founder-led problem solving. This repository powers the club’s static public website, including its events, team, reviews, and location information.

**Live website:** [nexcell.club](https://nexcell.club)  
**Repository:** [Nexcell-MSOT/NexCell](https://github.com/Nexcell-MSOT/NexCell)

## Features

- Responsive single-page website for the NexCell entrepreneurship club
- Hero section highlighting the club’s mission and latest activities
- About section covering:
  - Real-world problem solving
  - Design-driven innovation
  - Prototype-first development
  - Founder-style pitching
- Upcoming event teaser with Instagram updates
- Previous event highlights, including:
  - Zero to One speaker series
  - Mirai 0→1 flagship ideathon
- Animated event statistics and winner cards
- Event photo lookback gallery
- Team directory with member roles and social links
- Review submission form powered by Formspree
- Interactive event registration & pitch deck upload portal (`events/apply.html`)
- Private PostgreSQL database & S3 storage integration via Supabase (`database/schema.sql`, `js/supabaseClient.js`)
- Drag-and-drop file uploader supporting PDF, DOCX, PNG, JPG with client-side validation
- Responsive mobile navigation and dropdown menus
- Scroll reveal animations and active navigation highlighting
- Smooth anchor scrolling
- Animated counters, custom cursor effects, and interactive feature cards
- GitHub Pages custom-domain configuration through `CNAME`

## Tech Stack

- HTML5 & CSS3 (Glassmorphism design system)
- Vanilla JavaScript (Modular ES/UMD services)
- Supabase (PostgreSQL 15+, S3 Object Storage, Row Level Security)
- GitHub Pages (Static hosting)
- Google Fonts: Inter & Playfair Display
- Formspree for review submissions

## Project Structure

```text
.
├── index.html              # Main single-page website
├── form.html               # Gateway redirect to application form
├── style.css               # Responsive layout, theme, animations, and components
├── script.js               # Navigation, animations, interactions, and form handling
├── SUPABASE_SETUP.md       # Admin setup guide for Supabase database & storage
├── CNAME                   # Custom GitHub Pages domain: nexcell.club
├── robots.txt              # Search-engine crawler rules
├── sitemap.xml             # Sitemap for search indexing
├── database/
│   └── schema.sql          # PostgreSQL DDL, indexes, RLS, and storage bucket policies
├── events/
│   └── apply.html          # Application portal with drag-and-drop file uploader
├── js/
│   └── supabaseClient.js   # Client-side Supabase service with graceful demo fallback
└── images/
    ├── hero_*.jpg/png      # Hero and landing-page visuals
    ├── lookback/           # Event photo gallery assets
    └── winners/            # Mirai 0→1 winner images
```

## Run Locally

This is a static website and does not require installation.

### Option 1: Python HTTP server

```bash
git clone https://github.com/Nexcell-MSOT/NexCell.git
cd NexCell
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

### Option 2: Open directly

You can also open `index.html` directly in a browser. Using a local HTTP server is recommended for more consistent asset loading, navigation, and browser behavior.

## Deployment

The site is configured for GitHub Pages.

The root-level `CNAME` file contains:

```text
nexcell.club
```

To deploy changes:

1. Push changes to the `main` branch.
2. Configure GitHub Pages to deploy from the repository’s `main` branch and root directory.
3. Ensure the custom domain is configured as `nexcell.club`.
4. Confirm that DNS records for the domain point to GitHub Pages.

No build command is required.

## External Services and Assets

The website uses several external resources:

- Google Fonts for typography
- Externally hosted logo, profile, and event assets
- Instagram links for event announcements
- Social profile links for team members
- Formspree for processing review submissions

When modifying the site, verify that external image URLs and form integrations remain available.

## Contributing

Contributions are welcome from NexCell members and collaborators.

Before submitting changes:

1. Preview the website locally.
2. Check the layout on both desktop and mobile screen sizes.
3. Verify that navigation links and external URLs work.
4. Optimize newly added images where possible.
5. Keep event, team, and organizational information accurate.
6. Submit a pull request with a clear description of the changes.

## License

No license file is currently included in this repository. Please contact the NexCell maintainers before reusing the website code, content, branding, photographs, or other assets.
