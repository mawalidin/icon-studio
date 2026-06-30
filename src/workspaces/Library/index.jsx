import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BRANDS, ALL_BRAND_IDS } from "@/lib/brands.js";
import { sizedSvg, bakeColor, rasterize, downloadBlob, slugify } from "@/lib/svgHelpers.js";
import JSZip from "jszip";
import { supabase, isConfigured } from "@/lib/supabase.js";

// ── Constants ──────────────────────────────────────────────────────────────
const NEUTRAL_COLOR = "#78716C"; // stone-500, used when no brand selected for preview

const EXPORT_SIZES = [24, 50, 100, 150, 200, 250, 500];

const STYLE_OPTS   = ["line", "filled", "duotone", "duocolor"];
const SOURCE_OPTS  = ["generated", "uploaded", "imported"];

const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

// ── Badge helpers ──────────────────────────────────────────────────────────
// Returns which brand ids to render as dots on a tile.
function tileBadgeBrands(icon, filterBrand) {
  const avail = icon.brand_availability ?? ALL_BRAND_IDS;
  if (avail.length === ALL_BRAND_IDS.length) return []; // universal — no badge
  if (filterBrand) {
    // In a filtered view everything shown is available to that brand,
    // so only badge icons with narrow scope (1-2 brands).
    return avail.length <= 2 ? avail : [];
  }
  return avail;
}

// ── IconTile ───────────────────────────────────────────────────────────────
function IconTile({ icon, viewColor, filterBrand, isSelected, onClick, bulkMode, isChecked }) {
  const badgeBrands = tileBadgeBrands(icon, filterBrand);

  return (
    <button
      onClick={onClick}
      className={
        "group relative flex flex-col items-center gap-2 p-2.5 rounded-xl border transition-all " +
        (bulkMode
          ? isChecked
            ? "border-stone-900 bg-stone-50 shadow-sm"
            : "border-stone-200 bg-white hover:border-stone-300"
          : isSelected
            ? "border-stone-900 bg-stone-50 shadow-sm"
            : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm")
      }
    >
      {/* Icon preview */}
      <div
        className="w-full flex items-center justify-center rounded-lg transition-colors"
        style={{ height: 60, color: viewColor, background: isSelected ? "#F5F4F2" : "#FAFAF9" }}
      >
        <div dangerouslySetInnerHTML={{ __html: sizedSvg(icon.svg, 28) }} />
      </div>

      {/* Name */}
      <span
        className="text-xs text-stone-600 truncate w-full text-center leading-tight"
        title={icon.name}
      >
        {icon.name}
      </span>

      {/* Bulk checkbox overlay */}
      {bulkMode && (
        <div
          className={
            "absolute top-1.5 left-1.5 w-4 h-4 rounded border-2 flex items-center justify-center transition " +
            (isChecked ? "border-stone-900 bg-stone-900" : "border-stone-300 bg-white")
          }
        >
          {isChecked && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          )}
        </div>
      )}

      {/* Availability badges — read-only, fixed corner */}
      {badgeBrands.length > 0 && (
        <div className="absolute top-2 right-2 flex gap-0.5">
          {badgeBrands.map((brandId) => {
            const b = BRANDS.find((x) => x.id === brandId);
            return b ? (
              <div
                key={brandId}
                title={b.name}
                className="w-2 h-2 rounded-full border border-white shadow-sm"
                style={{ background: b.primary }}
              />
            ) : null;
          })}
        </div>
      )}
    </button>
  );
}

// ── TagEditor ──────────────────────────────────────────────────────────────
function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState("");

  function add(e) {
    e.preventDefault();
    const v = input.trim().toLowerCase();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  }

  return (
    <div className="flex flex-wrap gap-1.5 min-h-6">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-xs text-stone-600"
        >
          {tag}
          <button
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-stone-400 hover:text-stone-700 transition-colors"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <form onSubmit={add}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tags.length === 0 ? "Add tags…" : "+"}
          className="text-xs border-0 border-b border-dashed border-stone-300 focus:border-stone-500 outline-none bg-transparent py-0.5 w-20 placeholder:text-stone-400"
        />
      </form>
    </div>
  );
}

// ── DetailPanel ────────────────────────────────────────────────────────────
function DetailPanel({ icon, viewColor, onClose, onUpdate, onDelete, onAnimate }) {
  const [name, setName]           = useState(icon.name);
  const [style, setStyle]         = useState(icon.style);
  const [tags, setTags]           = useState(icon.descriptive_tags ?? []);
  const [avail, setAvail]         = useState(icon.brand_availability ?? ALL_BRAND_IDS);
  const [availDirty, setAvailDirty] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copied, setCopied]         = useState(false);
  const [exportSizes, setExportSizes] = useState(EXPORT_SIZES);
  const [exporting, setExporting]   = useState(null); // null | 'svg' | 'png' | 'zip'

  const slug = slugify(icon.name);

  function toggleSize(px) {
    setExportSizes((prev) =>
      prev.includes(px) ? prev.filter((s) => s !== px) : [...prev, px].sort((a, b) => a - b)
    );
  }

  async function handleExport(format) {
    if (!exportSizes.length || !icon.svg) return;
    setExporting(format);
    const color = viewColor === NEUTRAL_COLOR ? "#1c1917" : viewColor;
    try {
      if (format === "svg") {
        if (exportSizes.length === 1) {
          const px = exportSizes[0];
          const content = bakeColor(sizedSvg(icon.svg, px), color);
          downloadBlob(new Blob([content], { type: "image/svg+xml" }), `${slug}-${px}.svg`);
        } else {
          const zip = new JSZip();
          exportSizes.forEach((px) => {
            zip.file(`${slug}-${px}.svg`, bakeColor(sizedSvg(icon.svg, px), color));
          });
          downloadBlob(await zip.generateAsync({ type: "blob" }), `${slug}-svg.zip`);
        }
      }

      if (format === "png") {
        if (exportSizes.length === 1) {
          const dataUrl = await rasterize(icon.svg, color, exportSizes[0]);
          const blob = await (await fetch(dataUrl)).blob();
          downloadBlob(blob, `${slug}-${exportSizes[0]}.png`);
        } else {
          const zip = new JSZip();
          await Promise.all(
            exportSizes.map(async (px) => {
              const dataUrl = await rasterize(icon.svg, color, px);
              zip.file(`${slug}-${px}.png`, await (await fetch(dataUrl)).arrayBuffer());
            })
          );
          downloadBlob(await zip.generateAsync({ type: "blob" }), `${slug}-png.zip`);
        }
      }

      if (format === "zip") {
        const zip = new JSZip();
        const svgFolder = zip.folder("svg");
        const pngFolder = zip.folder("png");
        exportSizes.forEach((px) => {
          svgFolder.file(`${slug}-${px}.svg`, bakeColor(sizedSvg(icon.svg, px), color));
        });
        await Promise.all(
          exportSizes.map(async (px) => {
            const dataUrl = await rasterize(icon.svg, color, px);
            pngFolder.file(`${slug}-${px}.png`, await (await fetch(dataUrl)).arrayBuffer());
          })
        );
        downloadBlob(await zip.generateAsync({ type: "blob" }), `${slug}-export.zip`);
      }
    } catch (err) {
      console.error("Export failed", err);
    }
    setExporting(null);
  }

  useEffect(() => {
    setName(icon.name);
    setStyle(icon.style);
    setTags(icon.descriptive_tags ?? []);
    setAvail(icon.brand_availability ?? ALL_BRAND_IDS);
    setAvailDirty(false);
    setConfirmDel(false);
  }, [icon.id]);

  async function saveName() {
    if (name.trim() && name !== icon.name) await onUpdate(icon.id, { name: name.trim() });
  }

  async function saveTags(next) {
    setTags(next);
    await onUpdate(icon.id, { descriptive_tags: next });
  }

  function toggleBrand(brandId) {
    setAvail((prev) => {
      const next = prev.includes(brandId)
        ? prev.filter((b) => b !== brandId)
        : [...prev, brandId];
      return next.length > 0 ? next : prev; // must keep at least one
    });
    setAvailDirty(true);
  }

  async function saveAvail() {
    setSaving(true);
    await onUpdate(icon.id, { brand_availability: avail });
    setAvailDirty(false);
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    await onDelete(icon.id);
  }

  const prevAvail = icon.brand_availability ?? ALL_BRAND_IDS;
  const added   = avail.filter((b) => !prevAvail.includes(b));
  const removed = prevAvail.filter((b) => !avail.includes(b));

  return (
    <div className="flex flex-col h-full border-l border-stone-200 bg-white">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-5 py-3.5 border-b border-stone-200">
        <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">
          Icon detail
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Large preview */}
        <div
          className="flex items-center justify-center border-b border-stone-100"
          style={{ height: 148, color: viewColor }}
        >
          <div dangerouslySetInnerHTML={{ __html: sizedSvg(icon.svg, 72) }} />
        </div>

        <div className="p-5 space-y-5">

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              className="w-full text-sm font-medium border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          {/* Tags */}
          <div>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
              Tags
            </div>
            <TagEditor tags={tags} onChange={saveTags} />
            <p className="text-xs text-stone-400 mt-1.5">Used for search. Enter to add.</p>
          </div>

          {/* Brand availability */}
          <div>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">
              Brand availability
            </div>
            <div className="space-y-2">
              {BRANDS.map((brand) => {
                const on = avail.includes(brand.id);
                return (
                  <button
                    key={brand.id}
                    onClick={() => toggleBrand(brand.id)}
                    className={
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition " +
                      (on
                        ? "border-stone-200 bg-white"
                        : "border-stone-100 bg-stone-50 opacity-50")
                    }
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-none"
                      style={{ background: brand.primary }}
                    />
                    <span className="text-sm text-stone-700 flex-1">{brand.name}</span>
                    <div
                      className={
                        "w-4 h-4 rounded border-2 flex items-center justify-center transition " +
                        (on ? "border-stone-900 bg-stone-900" : "border-stone-300 bg-white")
                      }
                    >
                      {on && (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Reviewable diff before saving — friction is intentional */}
            {availDirty && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                {removed.length > 0 && (
                  <p className="text-xs text-amber-800 mb-1">
                    Removing from:{" "}
                    {removed.map((id) => BRANDS.find((b) => b.id === id)?.name).join(", ")}
                  </p>
                )}
                {added.length > 0 && (
                  <p className="text-xs text-amber-800 mb-1">
                    Adding to:{" "}
                    {added.map((id) => BRANDS.find((b) => b.id === id)?.name).join(", ")}
                  </p>
                )}
                <button
                  onClick={saveAvail}
                  disabled={saving}
                  className="w-full mt-2 text-xs font-medium py-1.5 rounded-md bg-amber-800 text-white hover:bg-amber-700 transition disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Confirm availability change"}
                </button>
              </div>
            )}
          </div>

          {/* Style — editable */}
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
              Style
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_OPTS.map((s) => (
                <button
                  key={s}
                  onClick={async () => {
                    setStyle(s);
                    await onUpdate(icon.id, { style: s });
                  }}
                  className={
                    "text-xs font-medium px-3 py-1.5 rounded-lg border transition " +
                    (style === s
                      ? "bg-stone-900 text-white border-stone-900"
                      : "border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-700")
                  }
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Meta */}
          <div className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2.5 space-y-1.5">
            {[
              ["Stroke",  icon.stroke_width != null ? `${icon.stroke_width}px` : "—"],
              ["Corners", icon.corners ?? "—"],
              ["Source",  icon.source],
              ["Added",   new Date(icon.created_at).toLocaleDateString()],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-stone-500">{label}</span>
                <span className="text-xs text-stone-700" style={mono}>{value}</span>
              </div>
            ))}
          </div>

          {/* Export */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Export</p>

            {/* Size toggles */}
            <div className="flex flex-wrap gap-1">
              {EXPORT_SIZES.map((px) => (
                <button
                  key={px}
                  onClick={() => toggleSize(px)}
                  className={
                    "text-xs px-2 py-1 rounded-md border transition " +
                    (exportSizes.includes(px)
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-400 border-stone-200 hover:border-stone-400 hover:text-stone-600")
                  }
                >
                  {px}
                </button>
              ))}
              <button
                onClick={() =>
                  setExportSizes(
                    exportSizes.length === EXPORT_SIZES.length ? [] : EXPORT_SIZES
                  )
                }
                className="text-xs px-2 py-1 rounded-md border border-stone-200 text-stone-400 hover:border-stone-400 hover:text-stone-600 transition"
              >
                {exportSizes.length === EXPORT_SIZES.length ? "None" : "All"}
              </button>
            </div>

            {/* SVG + PNG row */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { format: "svg", label: "SVG" },
                { format: "png", label: "PNG" },
              ].map(({ format, label }) => (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  disabled={!exportSizes.length || !!exporting}
                  className="flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {exporting === format ? (
                    "Exporting…"
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      {exportSizes.length === 1
                        ? `${label} · ${exportSizes[0]}px`
                        : `${label} · ${exportSizes.length} sizes`}
                    </>
                  )}
                </button>
              ))}
            </div>

            {/* ZIP (all sizes, both formats) */}
            <button
              onClick={() => handleExport("zip")}
              disabled={!exportSizes.length || !!exporting}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {exporting === "zip" ? (
                "Zipping…"
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  SVG + PNG · all {exportSizes.length} sizes · ZIP
                </>
              )}
            </button>
          </div>

          {/* Actions */}
          <div className="space-y-2 pb-2">
            <button
              onClick={() => {
                if (!icon.svg) return;
                navigator.clipboard?.writeText(icon.svg);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition"
            >
              {copied ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied — paste into Figma
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy SVG
                </>
              )}
            </button>
            <button
              onClick={onAnimate}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg border border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50 transition"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4V8Z" fill="currentColor" stroke="none" />
              </svg>
              Animate this
            </button>

            <button
              onClick={handleDelete}
              className={
                "w-full text-sm font-medium py-2 rounded-lg border transition " +
                (confirmDel
                  ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                  : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700")
              }
            >
              {confirmDel ? "Confirm delete" : "Delete icon"}
            </button>
            {confirmDel && (
              <button
                onClick={() => setConfirmDel(false)}
                className="w-full text-xs text-stone-400 hover:text-stone-600 transition"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FilterPill ─────────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        "px-2.5 py-1 rounded-md text-xs font-medium transition border " +
        (active
          ? "bg-stone-900 text-white border-stone-900"
          : "border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-700")
      }
    >
      {label}
    </button>
  );
}

// ── EmptyGrid ──────────────────────────────────────────────────────────────
function EmptyGrid({ search, hasFilters }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-10 h-10 rounded-xl border border-dashed border-stone-300 flex items-center justify-center mb-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
      </div>
      {search || hasFilters ? (
        <>
          <p className="text-sm font-medium text-stone-600 mb-1">No icons match</p>
          <p className="text-xs text-stone-400">Try a different search or clear the filters.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-stone-600 mb-1">Your library is empty</p>
          <p className="text-xs text-stone-400 max-w-xs leading-relaxed mb-4">
            Generate icons from a prompt, or import an existing SVG set to get started.
          </p>
          <button
            onClick={() => navigate("/generate")}
            className="text-xs font-medium px-4 py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition"
          >
            Generate your first icon
          </button>
        </>
      )}
    </div>
  );
}

// ── BulkActionBar ──────────────────────────────────────────────────────────
const STYLE_OPTS_BULK = ["line", "filled", "duotone", "duocolor"];

function BulkActionBar({ count, totalFiltered, onSelectAll, onClearAll, onBulkStyle, saving, progress, error, onExit }) {
  const progressLabel = saving && progress.total > 0
    ? `Saving ${progress.done}/${progress.total}…`
    : saving ? "Saving…" : null;

  return (
    <div className="flex-none border-t border-stone-200 bg-white">
      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-stone-800 tabular-nums">
          {count} selected
        </span>
        <button
          onClick={onSelectAll}
          disabled={saving}
          className="text-xs text-stone-500 hover:text-stone-700 underline disabled:opacity-40"
        >
          Select all {totalFiltered}
        </button>
        {count > 0 && (
          <button
            onClick={onClearAll}
            disabled={saving}
            className="text-xs text-stone-400 hover:text-stone-600 underline disabled:opacity-40"
          >
            Clear
          </button>
        )}

        <div className="flex-1" />

        {progressLabel && (
          <span className="text-xs text-stone-500 tabular-nums">{progressLabel}</span>
        )}

        {count > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400">Set style:</span>
            {STYLE_OPTS_BULK.map((s) => (
              <button
                key={s}
                onClick={() => onBulkStyle(s)}
                disabled={saving}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-stone-200 hover:border-stone-400 hover:bg-stone-50 transition disabled:opacity-40"
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onExit}
          disabled={saving}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700 transition ml-1 disabled:opacity-40"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Main Library ───────────────────────────────────────────────────────────
export default function Library() {
  const navigate = useNavigate();

  const [icons,        setIcons]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState(null);
  const [search,       setSearch]       = useState("");
  const [filterBrand,  setFilterBrand]  = useState(null);
  const [filterStyle,  setFilterStyle]  = useState(null);
  const [filterSource, setFilterSource] = useState(null);
  const [viewBrandId,  setViewBrandId]  = useState(null); // null = neutral stone
  const [selectedId,   setSelectedId]   = useState(null);
  const [bulkMode,     setBulkMode]     = useState(false);
  const [selectedIds,  setSelectedIds]  = useState(new Set());
  const [bulkSaving,   setBulkSaving]   = useState(false);
  const [bulkError,    setBulkError]    = useState(null);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  const viewColor    = viewBrandId ? (BRANDS.find((b) => b.id === viewBrandId)?.primary ?? NEUTRAL_COLOR) : NEUTRAL_COLOR;
  const selectedIcon = icons.find((i) => i.id === selectedId) ?? null;

  // ── Data ──────────────────────────────────────────────────────────────
  const fetchIcons = useCallback(async (manual = false) => {
    if (!isConfigured) { setLoading(false); return; }
    if (manual) setRefreshing(true);
    else        setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("icons")
        .select("*")
        .order("created_at", { ascending: false });
      if (err) throw err;
      setIcons(data ?? []);
    } catch (e) {
      setError(e.message ?? "Failed to load icons.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchIcons(); }, [fetchIcons]);

  async function updateIcon(id, patch) {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("icons")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (!err && data) {
      setIcons((prev) => prev.map((i) => (i.id === id ? { ...i, ...data } : i)));
    }
  }

  async function deleteIcon(id) {
    if (!supabase) return;
    await supabase.from("icons").delete().eq("id", id);
    setIcons((prev) => prev.filter((i) => i.id !== id));
    setSelectedId(null);
  }

  async function bulkUpdate(patch) {
    if (!supabase || selectedIds.size === 0) return;
    setBulkSaving(true);
    setBulkError(null);

    // Split into chunks of 50 to stay within URL length limits
    const ids = Array.from(selectedIds);
    const CHUNK = 50;
    const chunks = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    setBulkProgress({ done: 0, total: chunks.length });

    let failError = null;
    for (let i = 0; i < chunks.length; i++) {
      const { error } = await supabase.from("icons").update(patch).in("id", chunks[i]);
      if (error) { failError = error; break; }
      setBulkProgress({ done: i + 1, total: chunks.length });
    }

    if (!failError) {
      setIcons((prev) => prev.map((i) => (selectedIds.has(i.id) ? { ...i, ...patch } : i)));
      setSelectedIds(new Set());
      setBulkMode(false);
    } else {
      setBulkError(failError.message ?? "Update failed.");
    }
    setBulkSaving(false);
    setBulkProgress({ done: 0, total: 0 });
  }

  function toggleBulkMode() {
    setBulkMode((on) => !on);
    setSelectedIds(new Set());
    setSelectedId(null);
    setBulkError(null);
  }

  // ── Filtering ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return icons.filter((icon) => {
      if (search) {
        const q = search.toLowerCase();
        const nameHit = icon.name?.toLowerCase().includes(q);
        const tagHit  = (icon.descriptive_tags ?? []).some((t) => t.toLowerCase().includes(q));
        if (!nameHit && !tagHit) return false;
      }
      if (filterBrand  && !(icon.brand_availability ?? ALL_BRAND_IDS).includes(filterBrand)) return false;
      if (filterStyle  && icon.style  !== filterStyle)  return false;
      if (filterSource && icon.source !== filterSource) return false;
      return true;
    });
  }, [icons, search, filterBrand, filterStyle, filterSource]);

  const activeFilters = [filterBrand, filterStyle, filterSource].filter(Boolean).length;

  function clearFilters() {
    setFilterBrand(null);
    setFilterStyle(null);
    setFilterSource(null);
    setSearch("");
  }

  // ── Not configured ────────────────────────────────────────────────────
  if (!isConfigured) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="w-12 h-12 rounded-xl border border-dashed border-stone-300 flex items-center justify-center mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-stone-600 mb-1">Connect your database</p>
        <p className="text-xs text-stone-400 max-w-xs leading-relaxed mb-4">
          Add your Supabase credentials to <code className="font-mono bg-stone-100 px-1 rounded">.env</code> to see your icon library.
        </p>
        <div
          className="text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 text-left space-y-1 max-w-sm w-full"
          style={mono}
        >
          <div>VITE_SUPABASE_URL=https://…</div>
          <div>VITE_SUPABASE_ANON_KEY=…</div>
        </div>
        <p className="text-xs text-stone-400 mt-3">
          Restart <code className="font-mono bg-stone-100 px-1 rounded">npm run dev</code> after adding the env vars.
        </p>
      </div>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <Header search="" onSearch={() => {}} viewBrandId={null} onViewBrand={() => {}} filterBrand={null} onFilterBrand={() => {}} filterStyle={null} onFilterStyle={() => {}} filterSource={null} onFilterSource={() => {}} count={0} activeFilters={0} onClear={() => {}} onRefresh={() => {}} refreshing={false} bulkMode={false} onToggleBulk={() => {}} />
        <div className="flex-1 p-6 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", alignContent: "start" }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-stone-100 border border-stone-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={fetchIcons} className="text-xs text-stone-500 underline hover:text-stone-700">
          Try again
        </button>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Header
        search={search}           onSearch={setSearch}
        viewBrandId={viewBrandId} onViewBrand={setViewBrandId}
        filterBrand={filterBrand}   onFilterBrand={setFilterBrand}
        filterStyle={filterStyle}   onFilterStyle={setFilterStyle}
        filterSource={filterSource} onFilterSource={setFilterSource}
        count={filtered.length}
        activeFilters={activeFilters}
        onClear={clearFilters}
        onRefresh={() => fetchIcons(true)}
        refreshing={refreshing}
        bulkMode={bulkMode}
        onToggleBulk={toggleBulkMode}
      />

      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Grid + bulk action bar */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-6">
            {filtered.length === 0 ? (
              <EmptyGrid search={search} hasFilters={activeFilters > 0} />
            ) : (
              <div
                className="grid gap-2.5"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))" }}
              >
                {filtered.map((icon) => (
                  <IconTile
                    key={icon.id}
                    icon={icon}
                    viewColor={viewColor}
                    filterBrand={filterBrand}
                    isSelected={icon.id === selectedId}
                    bulkMode={bulkMode}
                    isChecked={selectedIds.has(icon.id)}
                    onClick={() => {
                      if (bulkMode) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(icon.id)) next.delete(icon.id);
                          else next.add(icon.id);
                          return next;
                        });
                      } else {
                        setSelectedId(icon.id === selectedId ? null : icon.id);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {bulkMode && (
            <BulkActionBar
              count={selectedIds.size}
              totalFiltered={filtered.length}
              onSelectAll={() => setSelectedIds(new Set(filtered.map((i) => i.id)))}
              onClearAll={() => setSelectedIds(new Set())}
              onBulkStyle={(style) => bulkUpdate({ style })}
              saving={bulkSaving}
              progress={bulkProgress}
              error={bulkError}
              onExit={toggleBulkMode}
            />
          )}
        </div>

        {/* Detail panel — hidden in bulk mode */}
        {!bulkMode && selectedIcon && (
          <div className="w-80 flex-none overflow-hidden">
            <DetailPanel
              icon={selectedIcon}
              viewColor={viewColor}
              onClose={() => setSelectedId(null)}
              onUpdate={updateIcon}
              onDelete={deleteIcon}
              onAnimate={() =>
                navigate(`/animate/${selectedIcon.id}`, {
                  state: { svg: selectedIcon.svg, name: selectedIcon.name },
                })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Header (defined last, uses FilterPill) ─────────────────────────────────
function Header({
  search, onSearch,
  viewBrandId, onViewBrand,
  filterBrand, onFilterBrand,
  filterStyle, onFilterStyle,
  filterSource, onFilterSource,
  count, activeFilters, onClear,
  onRefresh, refreshing,
  bulkMode, onToggleBulk,
}) {
  return (
    <div className="flex-none border-b border-stone-200 bg-white">
      {/* Row 1: search + count + view brand */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-stone-100">
        <div className="flex-1 relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by name or tag…"
            className="w-full text-sm border border-stone-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-400"
          />
        </div>
        <span className="text-xs text-stone-400 tabular-nums whitespace-nowrap" style={mono}>
          {count} icon{count !== 1 ? "s" : ""}
        </span>
        {activeFilters > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-stone-500 hover:text-stone-800 underline whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh library"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition flex-none disabled:opacity-40"
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={refreshing ? "animate-spin" : ""}
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
        </button>

        <button
          onClick={onToggleBulk}
          title={bulkMode ? "Exit bulk select" : "Bulk select icons"}
          className={
            "w-7 h-7 flex items-center justify-center rounded-lg transition flex-none " +
            (bulkMode
              ? "bg-stone-900 text-white"
              : "text-stone-400 hover:text-stone-700 hover:bg-stone-100")
          }
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </button>
      </div>

      {/* Row 2: filters + view brand picker */}
      <div className="flex items-center gap-4 px-5 py-2.5 overflow-x-auto">
        {/* Brand availability filter */}
        <div className="flex items-center gap-1.5 flex-none">
          <span className="text-xs text-stone-400 mr-0.5">Brand</span>
          {BRANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => onFilterBrand(filterBrand === b.id ? null : b.id)}
              title={b.name}
              className={
                "w-5 h-5 rounded-full border-2 transition " +
                (filterBrand === b.id ? "border-stone-900 scale-110" : "border-transparent hover:scale-105")
              }
              style={{ background: b.primary }}
            />
          ))}
        </div>

        <div className="w-px h-4 bg-stone-200 flex-none" />

        {/* Style filter */}
        <div className="flex items-center gap-1 flex-none">
          {STYLE_OPTS.map((s) => (
            <FilterPill
              key={s}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              active={filterStyle === s}
              onClick={() => onFilterStyle(filterStyle === s ? null : s)}
            />
          ))}
        </div>

        <div className="w-px h-4 bg-stone-200 flex-none" />

        {/* Source filter */}
        <div className="flex items-center gap-1 flex-none">
          {SOURCE_OPTS.map((s) => (
            <FilterPill
              key={s}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              active={filterSource === s}
              onClick={() => onFilterSource(filterSource === s ? null : s)}
            />
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* View brand picker — controls appearance color in grid */}
        <div className="flex items-center gap-1.5 flex-none">
          <span className="text-xs text-stone-400">View as</span>
          <button
            onClick={() => onViewBrand(null)}
            title="Neutral"
            className={
              "w-5 h-5 rounded-full border-2 transition bg-stone-400 " +
              (viewBrandId === null ? "border-stone-900 scale-110" : "border-transparent hover:scale-105")
            }
          />
          {BRANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => onViewBrand(viewBrandId === b.id ? null : b.id)}
              title={b.name}
              className={
                "w-5 h-5 rounded-full border-2 transition " +
                (viewBrandId === b.id ? "border-stone-900 scale-110" : "border-transparent hover:scale-105")
              }
              style={{ background: b.primary }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
