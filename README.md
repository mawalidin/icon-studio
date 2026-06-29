# Icon Studio

Internal icon library for RedDoorz, SANS Hotels, Urbanview, and The Lavana. Generate, animate, store, and export on-brand SVG icons from a single source of truth.

---

## What it does

| Workspace | Purpose |
|---|---|
| **Library** | Browse, search, and filter every saved icon. Edit names, tags, and brand availability. |
| **Generate** | Describe an icon in plain language — Claude produces multiple SVG variants on a 24px grid using `currentColor`. |
| **Animate** | Add hover, click, or idle micro-interactions. Export as CSS, Lottie JSON, or GIF. |
| **Import** | Bulk-import SVG files or a ZIP archive. Normalizes all icons to 24px, deduplicates by content hash, and optionally enriches with AI-generated names and search tags. |

Icons flow in one direction without leaving the tool: **Generate → Save to Library → Animate → Save motion back**.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| Database | Supabase (Postgres) |
| AI generation & tagging | Claude API via Supabase Edge Functions |
| ZIP extraction | JSZip (in-browser) |
| GIF export | gif.js (client-side) |
| Lottie export | Hand-built JSON |
| PNG export | Canvas API |

---

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- A [Supabase](https://supabase.com) project
- An Anthropic API key (for Generate and AI tagging — the rest of the app works without it)

---

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Both values are in **Supabase Dashboard → Project Settings → Data API / API Keys**.

### 3. Run the database migration

```bash
# Authenticate and link (first time only)
.\node_modules\.bin\supabase login
.\node_modules\.bin\supabase link --project-ref your-project-ref

# Push the schema
.\node_modules\.bin\supabase db push
```

This creates the `icons` table, indexes, RLS policies, and the `updated_at` trigger.

### 4. Deploy Edge Functions

```bash
.\node_modules\.bin\supabase functions deploy generate-icon
.\node_modules\.bin\supabase functions deploy tag-icon
```

### 5. Set the Anthropic API key

```bash
.\node_modules\.bin\supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

The key is stored on Supabase's servers and never exposed to the browser.

### 6. Start the dev server

```bash
.\node_modules\.bin\vite
```

Open `http://localhost:5173`.

---

## Project structure

```
src/
├── App.jsx                        # Router and top-bar nav
├── lib/
│   ├── brands.js                  # Brand tokens (colors, IDs)
│   ├── svgHelpers.js              # SVG utilities (normalize, sanitize, rasterize…)
│   ├── supabase.js                # Supabase client
│   └── ui.jsx                     # Shared UI atoms (Segmented, Label)
└── workspaces/
    ├── Library/index.jsx
    ├── Generate/index.jsx
    ├── Animate/index.jsx
    └── Import/index.jsx

supabase/
├── migrations/001_icons.sql       # Icons table schema
└── functions/
    ├── generate-icon/index.ts     # Calls Claude, returns SVG array
    └── tag-icon/index.ts          # Calls Claude, returns name + tags
```

---

## Brand tokens

| Brand | Primary | Duotone |
|---|---|---|
| RedDoorz | `#E63946` | `#FCD9DC` |
| SANS Hotels | `#1D2A3A` | `#D6DCE3` |
| Urbanview | `#2E7D6B` | `#D2E8E1` |
| The Lavana | `#1B2A4A` | `#E7D6A8` |

Brand appearance (color) is applied at render time via `currentColor` — it is not stored per icon. Brand availability (which brands may use an icon) is stored in `brand_availability text[]` and edited in the Library detail panel.

---

## Database schema (key fields)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Human-readable, editable |
| `svg` | text | Normalized source SVG using `currentColor` |
| `style` | text | `line` · `filled` · `duotone` |
| `brand_availability` | text[] | Which brands may use this icon |
| `descriptive_tags` | text[] | Search keywords |
| `motion` | jsonb | Animation config saved from the Animate workspace |
| `content_hash` | text | SHA-256 of normalized SVG, used for deduplication |

---

## Notes

- **Supabase free tier** pauses after ~1 week of inactivity — resume from the dashboard.
- **Generate** falls back to a direct browser API call in local dev if Supabase is not configured (requires the `anthropic-dangerous-direct-browser-access` header).
- **GIF export** is client-side via gif.js. If consistency across environments becomes an issue, this can move to a server-side pipeline.
- **Figma plugin** (Phase 4) is out of scope for this build but the data model supports it — `brand_availability` maps directly to which brands a component should appear in.
