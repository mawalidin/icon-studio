import React, { useState, useMemo, useRef } from "react";

// ──────────────────────────────────────────────────────────────────────────
// Brand tokens. Primary colors are editable defaults — adjust to match your
// exact brand guideline values. Each brand carries a primary + duotone pair.
// ──────────────────────────────────────────────────────────────────────────
const DEFAULT_BRANDS = [
  { id: "reddoorz", name: "RedDoorz", primary: "#E63946", duotone: "#FCD9DC" },
  { id: "sans", name: "SANS Hotels", primary: "#1D2A3A", duotone: "#D6DCE3" },
  { id: "urbanview", name: "Urbanview", primary: "#2E7D6B", duotone: "#D2E8E1" },
  { id: "lavana", name: "The Lavana", primary: "#1B2A4A", duotone: "#E7D6A8" },
];

const STYLES = [
  { id: "line", label: "Line" },
  { id: "filled", label: "Filled" },
  { id: "duotone", label: "Duotone" },
];

const EXPORT_SIZES = [50, 100, 150, 200, 250, 500];

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
function cleanSvg(raw) {
  if (!raw) return null;
  let s = raw.trim();
  // strip code fences if the model added them
  s = s.replace(/^```(?:svg|html|xml)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("<svg");
  const end = s.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return null;
  return s.slice(start, end + 6);
}

// Bake a concrete color into an SVG that uses currentColor, for self-contained export.
function bakeColor(svg, color) {
  if (!svg) return svg;
  return svg.replace(/currentColor/g, color);
}

// Force a known viewBox + remove hardcoded width/height so it scales cleanly.
function normalizeSvg(svg) {
  if (!svg) return svg;
  let s = svg;
  // remove fixed width/height on the root tag only
  s = s.replace(/<svg([^>]*)>/i, (m, attrs) => {
    let a = attrs
      .replace(/\swidth="[^"]*"/i, "")
      .replace(/\sheight="[^"]*"/i, "");
    if (!/viewBox=/i.test(a)) a += ' viewBox="0 0 24 24"';
    return `<svg${a}>`;
  });
  return s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────────────────────────────────────
// Small UI atoms
// ──────────────────────────────────────────────────────────────────────────
function Segmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-lg p-1 bg-stone-100 border border-stone-200">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={
              "flex-1 text-xs font-medium py-1.5 rounded-md transition " +
              (active
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Label({ children, value }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">
        {children}
      </span>
      {value != null && (
        <span
          className="text-xs text-stone-700"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────
export default function IconStudio() {
  const [brands, setBrands] = useState(DEFAULT_BRANDS);
  const [brandId, setBrandId] = useState("lavana");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("line");
  const [stroke, setStroke] = useState(1.5);
  const [corners, setCorners] = useState("rounded");
  const [count, setCount] = useState(4);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [variants, setVariants] = useState([]); // array of svg strings
  const [selected, setSelected] = useState(null); // svg string
  const [copied, setCopied] = useState(false);

  const brand = useMemo(
    () => brands.find((b) => b.id === brandId) || brands[0],
    [brands, brandId]
  );

  function updateBrandColor(color) {
    setBrands((prev) =>
      prev.map((b) => (b.id === brandId ? { ...b, primary: color } : b))
    );
  }

  async function generate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setVariants([]);
    setSelected(null);

    const cornerRules =
      corners === "rounded"
        ? 'stroke-linecap="round", stroke-linejoin="round"; rounded rectangles use a ~2px corner radius.'
        : 'stroke-linecap="square", stroke-linejoin="miter"; rectangles have sharp 0px corners.';

    const styleRules = {
      line: `LINE style — fill="none", stroke="currentColor", stroke-width="${stroke}". Every path shares the EXACT same stroke-width. The icon is described purely by outlines.`,
      filled: `FILLED style — fill="currentColor", no stroke. A solid silhouette. Cut interior negative space using fill-rule="evenodd" on a single path rather than overlapping shapes. Keep the same optical proportions a line version would have.`,
      duotone: `DUOTONE style (Phosphor-style) — TWO layers: (1) a base silhouette using fill="currentColor" with opacity="0.2", then (2) the key outlines/details on top using fill="none" stroke="currentColor" stroke-width="${stroke}" at full opacity. The base provides mass, the strokes provide definition.`,
    }[style];

    const system = `You are a senior icon designer producing production-grade SVG icons for a hospitality product. Your output must be indistinguishable in quality from Untitled UI Icons and Phosphor Icons. Mediocre, generic, or clip-art-looking icons are unacceptable.

═══ REFERENCE DNA ═══
Untitled UI: 24px grid, even stroke, rounded terminals, restrained detail, strong optical centering, consistent corner radii.
Phosphor: a strict KEYLINE system so every icon reads at the same optical size — a full-bleed square icon fills ~20×20, a circular icon is ~20 in diameter, a portrait shape is ~14 wide × 20 tall, a landscape shape is ~20 wide × 14 tall. Uniform terminals, geometric purity, economy of line.

═══ CONSTRUCTION RULES (follow ALL) ═══
1. Canvas: viewBox="0 0 24 24". Live area is 2–22 on both axes (2px clear margin). Nothing touches the edge.
2. KEYLINE sizing: pick the keyline that fits the subject and fill it. The icon must be optically as large and as balanced as the exemplars below — do not draw it small or floating.
3. OPTICAL centering, not just geometric — balance visual mass. Top-heavy or bottom-heavy icons are wrong.
4. ONE stroke width throughout. Never mix stroke widths in a single icon.
5. Snap coordinates to a 0.5 grid. No long decimals like 11.834. Clean numbers read crisper.
6. Geometric purity: build from circles, arcs, and straight segments. Reuse consistent angles (45°, 90°). Concentric/parallel elements stay evenly spaced.
7. Economy: the fewest paths that communicate the concept. No texture, no shading, no decorative flourishes, no background panels, no gradients, no drop shadows.
8. Corners: ${cornerRules}
9. Color: ONLY "currentColor". Never a hex value. (Theming is applied later.)
10. ${styleRules}

═══ QUALITY EXEMPLARS (this is the bar — match this construction, proportion, and economy) ═══
These reference icons use line/1.5/rounded. Observe the keyline sizing, the clean coordinates, the optical balance, and how few paths they use. Apply the SAME discipline to the requested style/stroke/corners.

House:
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/></svg>

Bell:
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10.5 20.5a1.7 1.7 0 0 0 3 0"/></svg>

Search:
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>

═══ BEFORE YOU OUTPUT, VERIFY EACH ICON ═══
✓ Fills its keyline (not small or floating), optically centered, within the 2–22 live area.
✓ Single consistent stroke width; clean 0.5-grid coordinates.
✓ Minimal paths; no decorative detail; recognizable at 16px.
✓ Matches the requested style (${style}), stroke (${stroke}), and corners (${corners}).
Each of the ${count} variants must be a genuinely DIFFERENT composition or metaphor for the concept — different angle, framing, or interpretation — not a trivial variation.

═══ OUTPUT FORMAT (critical) ═══
Respond with ONLY a valid JSON array of exactly ${count} strings. Each string is one complete SVG element from "<svg" to "</svg>". No markdown, no backticks, no commentary, no object keys — just the raw JSON array.`;

    const user = `Generate ${count} distinct icon variations representing: "${prompt.trim()}"`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      const data = await res.json();
      const text = (data.content || [])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();

      let arr = [];
      const cleaned = text.replace(/```json|```/g, "").trim();
      try {
        arr = JSON.parse(cleaned);
      } catch {
        // fallback: extract every <svg>…</svg> block
        const matches = cleaned.match(/<svg[\s\S]*?<\/svg>/gi);
        arr = matches || [];
      }

      const svgs = arr
        .map((s) => normalizeSvg(cleanSvg(typeof s === "string" ? s : "")))
        .filter(Boolean);

      if (!svgs.length) throw new Error("No valid icons returned. Try rephrasing the prompt.");

      setVariants(svgs);
      setSelected(svgs[0]);
    } catch (e) {
      setError(e.message || "Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function exportSvg() {
    if (!selected) return;
    const baked = bakeColor(selected, brand.primary);
    const blob = new Blob([baked], { type: "image/svg+xml" });
    downloadBlob(blob, `${slug(prompt)}_${brand.id}_${style}.svg`);
  }

  function exportPng(size) {
    if (!selected) return;
    const baked = bakeColor(normalizeSvg(selected), brand.primary);
    const svgBlob = new Blob([baked], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => {
        downloadBlob(blob, `${slug(prompt)}_${brand.id}_${style}_${size}px.png`);
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function copyCode() {
    if (!selected) return;
    const baked = bakeColor(selected, brand.primary);
    navigator.clipboard?.writeText(baked);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function slug(s) {
    return (s || "icon")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "icon";
  }

  const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

  return (
    <div
      className="w-full bg-stone-50 text-stone-900"
      style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}
    >
      {/* Header */}
      <div className="border-b border-stone-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Icon Studio</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Generation module · on-brand icons from a prompt
          </p>
        </div>
        <div className="flex items-center gap-2">
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => setBrandId(b.id)}
              title={b.name}
              className={
                "w-6 h-6 rounded-full border-2 transition " +
                (b.id === brandId ? "border-stone-900 scale-110" : "border-white shadow-sm")
              }
              style={{ background: b.primary }}
            />
          ))}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "320px 1fr" }}>
        {/* ───────────── Control panel ───────────── */}
        <div className="border-r border-stone-200 bg-white p-5 space-y-6">
          <div>
            <Label>Prompt</Label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
              }}
              placeholder="e.g. swimming pool, room service tray, free wifi, late checkout…"
              rows={3}
              className="w-full text-sm border border-stone-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-400"
            />
            <p className="text-xs text-stone-400 mt-1">⌘/Ctrl + Enter to generate</p>
          </div>

          <div>
            <Label>Style</Label>
            <Segmented options={STYLES} value={style} onChange={setStyle} />
          </div>

          <div>
            <Label value={`${stroke.toFixed(1)}px`}>Stroke weight</Label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.5}
              value={stroke}
              onChange={(e) => setStroke(parseFloat(e.target.value))}
              disabled={style === "filled"}
              className="w-full accent-stone-800 disabled:opacity-40"
            />
          </div>

          <div>
            <Label>Corners</Label>
            <Segmented
              options={[
                { id: "rounded", label: "Rounded" },
                { id: "sharp", label: "Sharp" },
              ]}
              value={corners}
              onChange={setCorners}
            />
          </div>

          <div>
            <Label value={`${count}`}>Variants</Label>
            <input
              type="range"
              min={2}
              max={6}
              step={1}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
              className="w-full accent-stone-800"
            />
          </div>

          <div>
            <Label>Brand color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brand.primary}
                onChange={(e) => updateBrandColor(e.target.value)}
                className="w-9 h-9 rounded-lg border border-stone-200 cursor-pointer p-0.5 bg-white"
              />
              <span className="text-sm text-stone-700" style={mono}>
                {brand.primary.toUpperCase()}
              </span>
              <span className="text-xs text-stone-400 ml-auto">{brand.name}</span>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={loading || !prompt.trim()}
            className="w-full bg-stone-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-stone-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Generating…" : "Generate icons"}
          </button>
        </div>

        {/* ───────────── Workspace ───────────── */}
        <div className="p-6 min-h-96">
          {error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loading && !variants.length && !error && (
            <div className="h-80 flex flex-col items-center justify-center text-center">
              <div
                className="w-16 h-16 rounded-2xl border-2 border-dashed border-stone-300 flex items-center justify-center mb-4"
                style={{ color: brand.primary }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v18M3 12h18" />
                </svg>
              </div>
              <p className="text-sm text-stone-500 max-w-xs">
                Describe an icon and generate {count} on-brand variations in the{" "}
                <span className="font-medium">{brand.name}</span> style.
              </p>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">
                Generating {count} variants…
              </p>
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: count }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-xl bg-stone-100 border border-stone-200 animate-pulse"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Variants */}
          {!loading && variants.length > 0 && (
            <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 300px" }}>
              {/* left: variant grid + size preview */}
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">
                  Variants — click to select
                </p>
                <div className="grid grid-cols-3 gap-3 mb-8">
                  {variants.map((svg, i) => {
                    const active = svg === selected;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelected(svg)}
                        className={
                          "aspect-square rounded-xl bg-white flex items-center justify-center transition border-2 " +
                          (active
                            ? "border-stone-900"
                            : "border-stone-200 hover:border-stone-400")
                        }
                        style={{ color: brand.primary }}
                      >
                        <div
                          style={{ width: 44, height: 44, color: brand.primary }}
                          dangerouslySetInnerHTML={{
                            __html: sized(svg, 44),
                          }}
                        />
                      </button>
                    );
                  })}
                </div>

                {selected && (
                  <>
                    <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">
                      Size preview
                    </p>
                    <div className="flex items-end gap-5 flex-wrap bg-white border border-stone-200 rounded-xl p-5">
                      {[24, 32, 48, 64].map((s) => (
                        <div key={s} className="flex flex-col items-center gap-2">
                          <div
                            style={{ color: brand.primary, width: s, height: s }}
                            dangerouslySetInnerHTML={{ __html: sized(selected, s) }}
                          />
                          <span className="text-xs text-stone-400" style={mono}>
                            {s}px
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* right: export panel */}
              {selected && (
                <div className="bg-white border border-stone-200 rounded-xl p-5 h-fit">
                  <div
                    className="aspect-square rounded-lg bg-stone-50 border border-stone-100 flex items-center justify-center mb-4"
                    style={{ color: brand.primary }}
                  >
                    <div
                      style={{ width: 96, height: 96, color: brand.primary }}
                      dangerouslySetInnerHTML={{ __html: sized(selected, 96) }}
                    />
                  </div>

                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
                    Export PNG
                  </p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {EXPORT_SIZES.map((s) => (
                      <button
                        key={s}
                        onClick={() => exportPng(s)}
                        className="text-xs py-1.5 rounded-md border border-stone-200 hover:border-stone-400 hover:bg-stone-50 transition"
                        style={mono}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={exportSvg}
                    className="w-full text-sm font-medium py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition mb-2"
                  >
                    Download SVG
                  </button>
                  <button
                    onClick={copyCode}
                    className="w-full text-sm font-medium py-2 rounded-lg border border-stone-200 hover:bg-stone-50 transition"
                  >
                    {copied ? "Copied ✓" : "Copy SVG code"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Render an svg string at a fixed pixel size (injects width/height back in).
function sized(svg, px) {
  if (!svg) return "";
  return svg.replace(
    /<svg([^>]*)>/i,
    `<svg$1 width="${px}" height="${px}" style="display:block">`
  );
}
