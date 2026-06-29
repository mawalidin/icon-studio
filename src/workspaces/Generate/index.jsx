import React, { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BRANDS, ALL_BRAND_IDS } from "@/lib/brands.js";
import { Segmented, Label } from "@/lib/ui.jsx";
import {
  cleanSvg,
  normalizeSvg,
  bakeColor,
  downloadBlob,
  slugify,
  sizedSvg,
} from "@/lib/svgHelpers.js";
import { supabase, isConfigured } from "@/lib/supabase.js";

// ── Constants ──────────────────────────────────────────────────────────────
const STYLES      = [{ id: "line", label: "Line" }, { id: "filled", label: "Filled" }, { id: "duotone", label: "Duotone" }];
const EXPORT_SIZES = [50, 100, 150, 200, 250, 500];

const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

// ── Helpers ────────────────────────────────────────────────────────────────
async function hashSvg(svg) {
  const normalized = svg.replace(/\s+/g, " ").trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── SavePanel ──────────────────────────────────────────────────────────────
// Shown when the user clicks "Save to library" on a selected variant.
function SavePanel({ svg, prompt, style, stroke, corners, brand, onDone, onCancel }) {
  const [name,      setName]      = useState(prompt.trim() || "Untitled icon");
  const [autoTag,   setAutoTag]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);
  const [savedName, setSavedName] = useState(null);

  async function save() {
    if (!isConfigured || !supabase) {
      setError("Supabase is not configured. Add your credentials to .env to save icons.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      let descriptive_tags = [];

      if (autoTag) {
        const { data: tagData, error: tagErr } = await supabase.functions.invoke("tag-icon", {
          body: { svg, hint: prompt },
        });
        if (!tagErr && tagData?.name) {
          setName(tagData.name);
          descriptive_tags = tagData.tags ?? [];
        }
      }

      const content_hash = await hashSvg(svg);

      // Upsert on content_hash to avoid duplicates
      const { error: upsertErr } = await supabase
        .from("icons")
        .upsert(
          {
            name: name.trim() || "Untitled icon",
            svg,
            style,
            stroke_width: stroke,
            corners,
            source: "generated",
            brand_availability: ALL_BRAND_IDS,
            descriptive_tags,
            content_hash,
          },
          { onConflict: "content_hash", ignoreDuplicates: false }
        );

      if (upsertErr) throw new Error(upsertErr.message);

      setSavedName(name.trim());
    } catch (e) {
      setError(e.message ?? "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (savedName) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded-full bg-stone-900 flex items-center justify-center flex-none">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          </div>
          <span className="text-sm font-medium text-stone-700">Saved to library</span>
        </div>
        <p className="text-xs text-stone-500 mb-3">"{savedName}" is now in your icon library.</p>
        <button
          onClick={onDone}
          className="w-full text-xs font-medium py-2 rounded-lg border border-stone-200 hover:bg-stone-50 transition"
        >
          Back to generate
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
      <div>
        <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">Save to library</p>
        <p className="text-xs text-stone-400">Available to all four brands by default.</p>
      </div>

      <div>
        <label className="text-xs font-medium text-stone-500 uppercase tracking-wide block mb-1.5">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300"
          placeholder="Icon name…"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoTag}
          onChange={(e) => setAutoTag(e.target.checked)}
          className="w-3.5 h-3.5 accent-stone-900 rounded"
        />
        <span className="text-xs text-stone-600">Auto-tag with AI</span>
        <span className="text-xs text-stone-400">(adds search tags + cleans name)</span>
      </label>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 text-xs font-medium py-2 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 transition"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="flex-1 text-xs font-medium py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Generate workspace ─────────────────────────────────────────────────────
export default function Generate() {
  const navigate = useNavigate();

  const [brands,   setBrands]   = useState(BRANDS.map((b) => ({ ...b }))); // local color edits
  const [brandId,  setBrandId]  = useState("lavana");
  const [prompt,   setPrompt]   = useState("");
  const [style,    setStyle]    = useState("line");
  const [stroke,   setStroke]   = useState(1.5);
  const [corners,  setCorners]  = useState("rounded");
  const [count,    setCount]    = useState(4);

  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [variants, setVariants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [copied,       setCopied]       = useState(false);
  const [copiedFigma,  setCopiedFigma]  = useState(false);
  const [saving,       setSaving]       = useState(false); // "save panel open"

  const brand = useMemo(
    () => brands.find((b) => b.id === brandId) ?? brands[0],
    [brands, brandId]
  );

  function updateBrandColor(color) {
    setBrands((prev) =>
      prev.map((b) => (b.id === brandId ? { ...b, primary: color } : b))
    );
  }

  // ── Generation ─────────────────────────────────────────────────────────
  async function generate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setVariants([]);
    setSelected(null);
    setSaving(false);

    try {
      let icons = [];

      if (isConfigured && supabase) {
        // Production path: through Edge Function proxy
        const { data, error: fnErr } = await supabase.functions.invoke("generate-icon", {
          body: { prompt: prompt.trim(), style, stroke, corners, count },
        });
        if (fnErr) throw new Error(fnErr.message ?? "Edge Function error");
        if (data?.error) throw new Error(data.error);
        icons = data?.icons ?? [];
      } else {
        // Dev fallback: direct call (works in Vite dev server; CORS-blocked in production)
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            system: buildSystemPrompt(style, stroke, corners, count),
            messages: [{ role: "user", content: `Generate ${count} distinct icon variations representing: "${prompt.trim()}"` }],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message ?? "API error");
        const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
        try { icons = JSON.parse(text.replace(/```json|```/g, "").trim()); }
        catch { icons = text.match(/<svg[\s\S]*?<\/svg>/gi) ?? []; }
      }

      const svgs = icons
        .map((s) => normalizeSvg(cleanSvg(typeof s === "string" ? s : "")))
        .filter(Boolean);

      if (!svgs.length) throw new Error("No valid icons returned. Try rephrasing the prompt.");

      setVariants(svgs);
      setSelected(svgs[0]);
    } catch (e) {
      setError(e.message ?? "Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Exports ────────────────────────────────────────────────────────────
  function exportSvg() {
    if (!selected) return;
    const baked = bakeColor(selected, brand.primary);
    downloadBlob(new Blob([baked], { type: "image/svg+xml" }), `${slugify(prompt)}_${brand.id}_${style}.svg`);
  }

  function exportPng(size) {
    if (!selected) return;
    const baked = bakeColor(normalizeSvg(selected), brand.primary);
    const url = URL.createObjectURL(new Blob([baked], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d").drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => {
        downloadBlob(blob, `${slugify(prompt)}_${brand.id}_${style}_${size}px.png`);
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function copyCode() {
    if (!selected) return;
    navigator.clipboard?.writeText(bakeColor(selected, brand.primary));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function copyForFigma() {
    if (!selected) return;
    navigator.clipboard?.writeText(selected); // currentColor — Figma accepts SVG text on Ctrl+V
    setCopiedFigma(true);
    setTimeout(() => setCopiedFigma(false), 1800);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-stone-50 text-stone-900">

      {/* Workspace header */}
      <div className="flex-none border-b border-stone-200 bg-white px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold tracking-tight">Generate</p>
          <p className="text-xs text-stone-400 mt-0.5">On-brand icons from a prompt</p>
        </div>
        <div className="flex items-center gap-1.5">
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => setBrandId(b.id)}
              title={b.name}
              className={
                "w-5 h-5 rounded-full border-2 transition " +
                (b.id === brandId ? "border-stone-900 scale-110" : "border-white shadow-sm hover:scale-105")
              }
              style={{ background: b.primary }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: "300px 1fr" }}>

        {/* ── Controls ── */}
        <div className="border-r border-stone-200 bg-white overflow-y-auto p-5 space-y-6">

          <div>
            <Label>Prompt</Label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
              placeholder="e.g. swimming pool, room service tray, free wifi, late checkout…"
              rows={3}
              className="w-full text-sm border border-stone-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-400"
            />
            <p className="text-xs text-stone-400 mt-1">⌘ / Ctrl + Enter to generate</p>
          </div>

          <div>
            <Label>Style</Label>
            <Segmented options={STYLES} value={style} onChange={setStyle} />
          </div>

          <div>
            <Label value={`${stroke.toFixed(1)}px`}>Stroke weight</Label>
            <input
              type="range" min={1} max={3} step={0.5} value={stroke}
              onChange={(e) => setStroke(parseFloat(e.target.value))}
              disabled={style === "filled"}
              className="w-full accent-stone-800 disabled:opacity-40"
            />
          </div>

          <div>
            <Label>Corners</Label>
            <Segmented
              options={[{ id: "rounded", label: "Rounded" }, { id: "sharp", label: "Sharp" }]}
              value={corners}
              onChange={setCorners}
            />
          </div>

          <div>
            <Label value={String(count)}>Variants</Label>
            <input
              type="range" min={2} max={6} step={1} value={count}
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
              <span className="text-sm text-stone-700" style={mono}>{brand.primary.toUpperCase()}</span>
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

        {/* ── Workspace ── */}
        <div className="overflow-y-auto p-6 min-h-0">

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
                Describe an icon to generate {count} on-brand variations in the{" "}
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
                  <div key={i} className="aspect-square rounded-xl bg-stone-100 border border-stone-200 animate-pulse" />
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && variants.length > 0 && (
            <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 288px" }}>

              {/* Variants grid + size preview */}
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">
                  Variants — click to select
                </p>
                <div className="grid grid-cols-3 gap-3 mb-8">
                  {variants.map((svg, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelected(svg); setSaving(false); }}
                      className={
                        "aspect-square rounded-xl bg-white flex items-center justify-center transition border-2 " +
                        (svg === selected ? "border-stone-900" : "border-stone-200 hover:border-stone-400")
                      }
                      style={{ color: brand.primary }}
                    >
                      <div
                        style={{ width: 44, height: 44, color: brand.primary }}
                        dangerouslySetInnerHTML={{ __html: sizedSvg(svg, 44) }}
                      />
                    </button>
                  ))}
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
                            dangerouslySetInnerHTML={{ __html: sizedSvg(selected, s) }}
                          />
                          <span className="text-xs text-stone-400" style={mono}>{s}px</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Export + save panel */}
              {selected && (
                <div className="space-y-3">
                  {!saving ? (
                    <>
                      {/* Icon preview */}
                      <div className="bg-white border border-stone-200 rounded-xl p-5">
                        <div
                          className="aspect-square rounded-lg bg-stone-50 border border-stone-100 flex items-center justify-center mb-4"
                          style={{ color: brand.primary }}
                        >
                          <div
                            style={{ width: 96, height: 96, color: brand.primary }}
                            dangerouslySetInnerHTML={{ __html: sizedSvg(selected, 96) }}
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
                        <button
                          onClick={copyForFigma}
                          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg border border-stone-200 hover:bg-stone-50 transition"
                        >
                          {copiedFigma ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Copied — paste into Figma
                            </>
                          ) : (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              Copy for Figma
                            </>
                          )}
                        </button>
                      </div>

                      {/* Save to library */}
                      <button
                        onClick={() => setSaving(true)}
                        className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-xl border-2 border-dashed border-stone-300 text-stone-500 hover:border-stone-400 hover:text-stone-700 transition"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                          <polyline points="17 21 17 13 7 13 7 21" />
                          <polyline points="7 3 7 8 15 8" />
                        </svg>
                        Save to library
                      </button>
                    </>
                  ) : (
                    <SavePanel
                      svg={selected}
                      prompt={prompt}
                      style={style}
                      stroke={stroke}
                      corners={corners}
                      brand={brand}
                      onDone={() => setSaving(false)}
                      onCancel={() => setSaving(false)}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── System prompt builder (mirrors Edge Function, used in dev-fallback path) ─
function buildSystemPrompt(style, stroke, corners, count) {
  const cornerRules =
    corners === "rounded"
      ? 'stroke-linecap="round", stroke-linejoin="round"; rounded rectangles use a ~2px corner radius.'
      : 'stroke-linecap="square", stroke-linejoin="miter"; rectangles have sharp 0px corners.';

  const styleRules = {
    line: `LINE style — fill="none", stroke="currentColor", stroke-width="${stroke}". Every path shares the EXACT same stroke-width.`,
    filled: `FILLED style — fill="currentColor", no stroke. Cut interior negative space using fill-rule="evenodd" on a single path.`,
    duotone: `DUOTONE style (Phosphor-style) — base silhouette fill="currentColor" opacity="0.2", then key outlines fill="none" stroke="currentColor" stroke-width="${stroke}" at full opacity.`,
  }[style] ?? "";

  return `You are a senior icon designer producing production-grade SVG icons for a hospitality product. Your output must be indistinguishable in quality from Untitled UI Icons and Phosphor Icons.

═══ CONSTRUCTION RULES ═══
1. Canvas: viewBox="0 0 24 24". Live area 2–22 on both axes.
2. Keyline sizing: fill the keyline. Optically large and balanced.
3. One stroke width throughout. Snap to 0.5 grid.
4. Corners: ${cornerRules}
5. Color: ONLY "currentColor".
6. ${styleRules}

═══ OUTPUT FORMAT ═══
Respond with ONLY a valid JSON array of exactly ${count} SVG strings. No markdown, no commentary.`;
}
