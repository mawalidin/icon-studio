# Icon Studio — Build Brief

A handoff specification for building the unified icon tool. This document captures every architectural and design decision already made. Build the project around the two existing component files (`IconStudio.jsx` and `IconMotion.jsx`) rather than from scratch.

---

## 1. What we're building

An internal tool for a multi-brand hospitality company (RedDoorz, SANS Hotels, Urbanview, The Lavana) that lets product designers **generate, animate, store, and export on-brand icons** from a single source of truth. It exists to end icon inconsistency: today designers pull mismatched free icons from the web; this tool gives them one library that produces production-ready, on-brand assets.

It is **one unified application** with three workspaces sharing state, unified by a central library:

- **Library** — browse, search, filter, and manage every saved icon (the spine).
- **Generate** — produce new icons from a text prompt via the Claude API.
- **Animate** — add hover / click / idle micro-interactions and export motion.

An icon flows: *Generate → Save to Library → open from Library → Animate → save motion back*. The icon never leaves the tool to move between steps. This continuity is the core value — do not split these into separate apps or force copy-paste between them.

---

## 2. The two existing files (build around these)

You are given two working React components built as standalone prototypes. They contain real, tested logic. **Reuse their internals; restructure their packaging.**

### `IconStudio.jsx` → becomes the **Generate** workspace
- Prompt input + style controls (line / filled / duotone), stroke weight (default 1.5px), corner style (rounded / sharp), variant count.
- Brand token selector with editable primary color.
- Calls the Claude API to return multiple SVG variants on a 24px grid using `currentColor`.
- Variant grid, multi-size preview, export (SVG + PNG at 50/100/150/200/250/500px).
- **Contains the tuned generation system prompt** (see §7) — this is valuable, preserve it exactly.

### `IconMotion.jsx` → becomes the **Animate** workspace
- Three triggers (hover / click / idle), each with presets, plus duration / intensity / easing controls.
- Live preview that responds to real hover/click; 20px & 32px size-check tiles.
- **Three working export formats**: CSS (single source of truth shared with preview), Lottie JSON (icon embedded as image layer with transform animation baked in), GIF (client-side encoding via gif.js, with a background-color option).
- SVG upload (SVG-first), with sanitization, normalization, size guideline, and a **Coloring** toggle (Brand color vs Original) with auto-detection of hardcoded colors.

### Required integration changes to these files
1. **Replace the direct Claude API call.** `IconStudio.jsx` currently does `fetch("https://api.anthropic.com/v1/messages")` directly — this only works inside the claude.ai artifact sandbox. In the real app, the browser must **not** call Anthropic directly (CORS + key exposure). Route through a backend proxy (see §6).
2. **Extract shared code into common modules** instead of duplicating across both files:
   - Brand tokens / config.
   - UI atoms (`Segmented`, `Label`).
   - SVG helpers (`cleanSvg`, `normalizeSvg` / `normalizeImportedSvg`, `forceCurrentColor`, `bakeColor`, `rasterize`, `sanitizeSvg`).
3. **Wire them to the Library**: `Generate` gets a "Save to Library" action; `Animate` receives an icon from the Library (via route/state) and writes its motion config back.
4. **Remove browser-storage assumptions** — these were React-state-only in the artifact; in the real app, persistence goes through Supabase.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Framework | React + Vite |
| Styling | Tailwind CSS |
| Routing | React Router (3 workspaces + library detail view) |
| Database / backend | Supabase (Postgres) |
| AI generation & tagging | Claude API via a Supabase Edge Function proxy |
| SVG optimisation | SVGO (in-browser) |
| PNG export | Canvas API |
| GIF export | gif.js (client-side; already implemented in `IconMotion.jsx`) |
| Lottie export | hand-built JSON (already implemented in `IconMotion.jsx`) |

**Storage decision:** Supabase was chosen over a Google-Drive-only approach. A library is fundamentally a queryable database (filter by brand + tag + style), which Drive does poorly. A documented future alternative is a **hybrid**: heavy assets in Drive, metadata index in a database — note this in the README but build on Supabase for now.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────┐
│  Unified Web App (React + Vite)                      │
│                                                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐          │
│  │ Library  │   │ Generate │   │ Animate  │          │
│  │ (spine)  │◄─►│          │   │          │          │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘          │
│       │              │              │                 │
│       └──────────────┴──────────────┘                 │
│                shared state + helpers                 │
└───────────────────────┬─────────────────────────────┘
                        │
        ┌───────────────┴────────────────┐
        │                                 │
┌───────▼────────┐              ┌─────────▼──────────┐
│ Supabase        │              │ Edge Function proxy│
│ Postgres: icons │              │ holds ANTHROPIC key│
│ (+ brands cfg)  │              │ generate + tag     │
└─────────────────┘              └─────────┬──────────┘
                                          │
                                  ┌───────▼────────┐
                                  │  Claude API     │
                                  └────────────────┘
```

The library is the hub; Generate and Animate read from and write to it. Phase 4 (a Figma plugin that browses the library) is out of scope for this build but the data model must support it.

---

## 5. Data model

### `icons` table

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `name` | text | Human-readable, editable. |
| `svg` | text | Normalized source SVG. Uses `currentColor` where the icon is single-color. |
| `style` | text enum | `line` \| `filled` \| `duotone`. |
| `stroke_width` | numeric | For line/duotone. |
| `corners` | text enum | `rounded` \| `sharp`. |
| `source` | text enum | `generated` \| `uploaded` \| `imported`. |
| `brand_availability` | text[] | **Which brands MAY use this icon.** Default = all four. See §5.1. |
| `descriptive_tags` | text[] | Free-form search keywords (e.g. `bed, sleep, room`). |
| `motion` | jsonb (nullable) | Animation config: `{ trigger, preset, duration, easing, intensity, colorMode }`. |
| `content_hash` | text | Hash of normalized SVG, for dedup. |
| `created_at` / `updated_at` | timestamptz | |

### 5.1 Two independent brand concepts — DO NOT conflate

This is the single most important modeling decision. There are **two** brand-related ideas, and they must be separate fields/systems:

- **Brand availability** (`brand_availability`) — *which brands are allowed to use this icon.* A controlled multi-select over the four brands. A universal icon = all four; a Lavana-only crest = `["lavana"]`. This is scoping/permission, used for filtering and the Figma plugin.
- **Brand appearance** — *what color the icon renders in.* This is **not stored per icon.** It is applied at view/use time from the brand token config. One icon re-themes across all four palettes. The `Generate` and `Animate` workspaces already demonstrate this via `currentColor` + a color picker.

An icon can be available to all four brands (availability) while still rendering in each brand's own color when used (appearance). Keep these orthogonal.

### Brand token config (app config or a `brands` table)

Four brands, each with: `id`, `name`, `primary` color, `duotone` pair. Defaults from the existing files (correct these to exact guideline hex values):

- RedDoorz — primary `#E63946`
- SANS Hotels — primary `#1D2A3A`
- Urbanview — primary `#2E7D6B`
- The Lavana — primary `#1B2A4A` (navy; uses navy/sand/gold)

Drives **appearance**, not availability.

---

## 6. Claude API proxy (critical)

The browser must never hold the Anthropic key. Build a **Supabase Edge Function** that holds `ANTHROPIC_API_KEY` as a secret and exposes:

- `generate-icon` — receives prompt + style params, builds the system prompt (§7), calls Anthropic, returns the JSON array of SVG strings.
- `tag-icon` — receives an SVG, asks Claude for a cleaned name + descriptive tags, returns them (used by import enrichment, §8).

The frontend calls these functions; the function calls Anthropic. Replace `IconStudio.jsx`'s direct `fetch` to `api.anthropic.com` with a call to `generate-icon`.

---

## 7. The tuned generation system prompt (preserve verbatim)

This prompt was iteratively tuned to match Untitled UI Icons and Phosphor. It is the core IP of the Generate workspace. Keep it intact in the `generate-icon` function. `${style}`, `${stroke}`, `${corners}`, `${count}` are injected; `cornerRules` and `styleRules` are derived strings.

```
You are a senior icon designer producing production-grade SVG icons for a hospitality product. Your output must be indistinguishable in quality from Untitled UI Icons and Phosphor Icons. Mediocre, generic, or clip-art-looking icons are unacceptable.

═══ REFERENCE DNA ═══
Untitled UI: 24px grid, even stroke, rounded terminals, restrained detail, strong optical centering, consistent corner radii.
Phosphor: a strict KEYLINE system so every icon reads at the same optical size — a full-bleed square icon fills ~20×20, a circular icon is ~20 in diameter, a portrait shape is ~14 wide × 20 tall, a landscape shape is ~20 wide × 14 tall. Uniform terminals, geometric purity, economy of line.

═══ CONSTRUCTION RULES (follow ALL) ═══
1. Canvas: viewBox="0 0 24 24". Live area is 2–22 on both axes (2px clear margin). Nothing touches the edge.
2. KEYLINE sizing: pick the keyline that fits the subject and fill it. The icon must be optically as large and as balanced as the exemplars below.
3. OPTICAL centering, not just geometric — balance visual mass.
4. ONE stroke width throughout. Never mix stroke widths in a single icon.
5. Snap coordinates to a 0.5 grid. No long decimals.
6. Geometric purity: build from circles, arcs, and straight segments. Reuse consistent angles. Concentric/parallel elements stay evenly spaced.
7. Economy: the fewest paths that communicate the concept. No texture, no shading, no decorative flourishes, no background panels, no gradients, no drop shadows.
8. Corners: {cornerRules}
9. Color: ONLY "currentColor". Never a hex value.
10. {styleRules}

═══ QUALITY EXEMPLARS (match this construction, proportion, and economy) ═══
House:
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/></svg>
Bell:
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10.5 20.5a1.7 1.7 0 0 0 3 0"/></svg>
Search:
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>

═══ BEFORE YOU OUTPUT, VERIFY EACH ICON ═══
✓ Fills its keyline, optically centered, within the 2–22 live area.
✓ Single consistent stroke width; clean 0.5-grid coordinates.
✓ Minimal paths; recognizable at 16px.
✓ Matches the requested style, stroke, and corners.
Each variant must be a genuinely DIFFERENT composition or metaphor — not a trivial variation.

═══ OUTPUT FORMAT ═══
Respond with ONLY a valid JSON array of exactly {count} strings, each a complete SVG element. No markdown, no commentary, no keys.
```

- `cornerRules` (rounded): `stroke-linecap="round", stroke-linejoin="round"; rounded rectangles use a ~2px corner radius.`
- `cornerRules` (sharp): `stroke-linecap="square", stroke-linejoin="miter"; rectangles have sharp 0px corners.`
- `styleRules` (line): `LINE — fill="none", stroke="currentColor", stroke-width="{stroke}". Every path shares the exact same stroke-width.`
- `styleRules` (filled): `FILLED — fill="currentColor", no stroke. Cut interior negative space with fill-rule="evenodd" on a single path.`
- `styleRules` (duotone): `DUOTONE (Phosphor-style) — base silhouette fill="currentColor" opacity="0.2", then key outlines on top fill="none" stroke="currentColor" stroke-width="{stroke}" at full opacity.`

---

## 8. Module specifications

### 8.1 Generate workspace
Port from `IconStudio.jsx`. Same controls and UX. Two changes: (1) generation goes through the `generate-icon` Edge Function; (2) a **Save to Library** action on a selected variant — writes an `icons` row with `source = generated`, the chosen style/stroke/corners, `brand_availability` defaulting to all four, and (optionally) auto-generated descriptive tags via `tag-icon`.

### 8.2 Animate workspace
Port from `IconMotion.jsx`. Keep the motion engine, the CSS/Lottie/GIF exports, the upload path, and the Coloring toggle exactly as built. Changes: (1) it can receive an icon from the Library ("Animate this" in the detail view loads it here); (2) **Save motion** writes the motion config back to that icon's `motion` field. GIF stays client-side; if the production environment ever needs guaranteed consistency, GIF can later move to a server pipeline (note only).

### 8.3 Library workspace (new)
The spine. Build:

- **Grid of icon tiles** — preview (rendered in a selected brand's appearance color or neutral), name, read-only brand badges (see §9).
- **Search** — text match on `name` + `descriptive_tags`.
- **Filters** — by brand availability (contains brand), by style, by source.
- **Detail view** (opened intentionally — see §9): large preview, editable name, editable descriptive tags, **brand-availability editor** (four toggles, the *safe* place to change scope), style info, "Animate this" button, usage notes, delete. The availability editor should make the change reviewable (show what's being added/removed), because scope changes are low-frequency but high-consequence.

### 8.4 Import (new)
Two tiers, both reading files **in-browser** (decoupled from where the library ultimately lives — no Google Drive OAuth needed for this build):

- **Bulk import** — accept a multi-file/folder selection or a ZIP. For each SVG: sanitize, normalize, derive `name` from filename, guess `style` from stroke-vs-fill, set `brand_availability` = all four (universal default), compute `content_hash`. This seeds the existing 100+ Untitled icons in one pass.
- **Per-icon upload** — the generalized single-upload path for ongoing additions.

Plus:
- **Optional AI tagging** — a step the importer can run to enrich the batch via `tag-icon` (cleaned name + descriptive tags) for real search quality. Make it optional so a quick import stays fast; a one-time cost for a permanently better library.
- **Deduplication** — match on `content_hash` (or normalized name). Re-running import updates rather than duplicates. Show an import summary (new / updated / skipped).

---

## 9. Key UX decisions (locked)

- **Brand badges mark exceptions, not the norm.** Universal icons (all four brands) get **no badge** — the absence of a badge means "safe to use anywhere." Restricted icons get small **brand-colored dots** (in a fixed tile corner) showing their scope, with brand name on hover. With 100+ mostly-universal icons, badging everything would be noise; badge only what's restricted.
- **Badges are read-only on tiles.** Scope is never changed by clicking a tile dot.
- **Scope is edited only in the detail view** — deliberately, because brand availability is low-frequency and high-consequence (a silent misclick that removes an icon from a brand isn't noticed until it's in a live screen). Friction here is a feature.
- **Availability dots must be visually distinct from the icon's own appearance color**, so "scope" and "color" never blur (fixed corner placement, consistent treatment).
- **Context-aware badging:** when browsing unfiltered, dots show scope; when filtered to one brand, everything shown is available to that brand, so instead mark the *narrow-scope/exclusive* ones ("Lavana only") rather than re-confirming availability on all.

---

## 10. Design / quality bar

Follow the `frontend-design` skill. The established aesthetic is an **instrument-like workbench**: quiet, neutral chrome (stone palette, hairline borders), monospace labels for technical values (sizes, stroke, hex), so the colorful icons are the focus, not the UI. Keep this consistent across all three workspaces. Meet a quality floor: responsive, visible keyboard focus, reduced-motion respected. Sentence case throughout.

---

## 11. Recommended build sequence

1. Scaffold Vite + React + Tailwind + React Router; build the app shell with the three-workspace nav.
2. Extract shared modules (brand config, UI atoms, SVG helpers) from the two existing files.
3. Port `IconMotion.jsx` → Animate workspace (self-contained; no backend needed for its core).
4. Set up Supabase project + `icons` table + client; build the Library workspace (browse / search / filter / badges / detail view) against it.
5. Stand up the Edge Function proxy; port `IconStudio.jsx` → Generate workspace using the proxy; wire **Save to Library**.
6. Build Import (per-icon + bulk + dedup + optional AI tagging).
7. Wire cross-workspace flow: Save from Generate, "Animate this" from detail view, Save motion back.
8. Polish against §10.

---

## 12. Setup notes

- **Env (frontend):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Secret (Edge Function only):** `ANTHROPIC_API_KEY` — never exposed to the browser.
- Supabase free tier is sufficient for this scale; note that free projects pause after ~1 week of inactivity.
- Standard scripts: `npm install`, `npm run dev`.
- For Claude Code / Supabase setup specifics, see the official docs: https://docs.claude.com/en/docs/claude-code/overview and the Supabase docs.

---

## 13. Out of scope (deliberate future items)

- **Figma plugin** (Phase 4) — browses the library and pushes icons to canvas as named components. The data model already supports it.
- **Guarded bulk re-scope** — select many icons, review, apply a brand-availability change at once (useful when a new brand launches). Detail-view-per-icon stays the default for safety; this is an additive future action.
- **True two-tone retinting** — preserve some colors, swap others (current Coloring toggle is single-color flatten vs original).
- **Raster (PNG/JPG) upload** — animates fine but loses recoloring and crisp scaling; deliberately declined for now to stay SVG-first.
- **Approval workflow** — currently **open** (any designer's icon is immediately live); schema can add a `status` field later without restructuring.
- **Google Drive hybrid storage** — assets in Drive, metadata in DB; documented alternative, not built now.
- **Server-side GIF pipeline** — only if client-side consistency becomes an issue.
