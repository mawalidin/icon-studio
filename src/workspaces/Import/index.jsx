import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { ALL_BRAND_IDS } from "@/lib/brands.js";
import { sanitizeSvg, normalizeImportedSvg, normalizeToGrid, sizedSvg } from "@/lib/svgHelpers.js";
import { supabase, isConfigured } from "@/lib/supabase.js";

const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const NEUTRAL = "#78716C";

// ── Helpers ────────────────────────────────────────────────────────────────

async function hashSvg(svg) {
  const normalized = svg.replace(/\s+/g, " ").trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function deriveName(filename) {
  const name = filename
    .replace(/\.svg$/i, "")
    // Strip common icon-library prefixes: icon-, ic-, img-, i-
    .replace(/^(icons?|ic|img|image|svg)[-_\s]/i, "")
    // Strip trailing size suffixes: -24, _20px, -16
    .replace(/[-_\s]\d+(px)?$/i, "")
    // Strip leading numeric sort prefixes: 001-, 42_
    .replace(/^\d+[-_\s]/, "")
    // Split camelCase / PascalCase
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    // Replace separators with spaces and collapse
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name
    ? name.replace(/\b\w/g, (c) => c.toUpperCase())
    : "Untitled";
}

function guessStyle(svg) {
  const hasFill   = /fill\s*[:=]\s*["']?currentColor/i.test(svg);
  const hasStroke = /stroke\s*[:=]\s*["']?currentColor/i.test(svg);
  const hasDuo    = /opacity\s*[:=]\s*["']?0\.[12]/i.test(svg);
  if (hasDuo && hasStroke) return "duotone";
  if (hasFill && !hasStroke) return "filled";
  return "line";
}

function guessStroke(svg) {
  const m = svg.match(/stroke-width\s*[:=]\s*["']?([\d.]+)/i);
  return m ? parseFloat(m[1]) : 1.5;
}

function guessCorners(svg) {
  return /stroke-linecap\s*[:=]\s*["']?square/i.test(svg) ? "sharp" : "rounded";
}

async function parseSvgText(text, filename) {
  const sanitized = sanitizeSvg(text);
  const normalized = normalizeToGrid(normalizeImportedSvg(sanitized));
  if (!normalized) return null;
  const hash = await hashSvg(normalized);
  return {
    id: `${filename}-${hash.slice(0, 8)}`,
    filename,
    name: deriveName(filename),
    svg: normalized,
    style: guessStyle(normalized),
    stroke_width: guessStroke(normalized),
    corners: guessCorners(normalized),
    size: text.length,
    hash,
  };
}

async function processFileList(files) {
  const all = Array.from(files);
  const svgFiles = all.filter((f) => /\.svg$/i.test(f.name) || f.type === "image/svg+xml");
  const zipFiles = all.filter((f) => /\.zip$/i.test(f.name) || f.type === "application/zip");

  const results = [];

  // Direct SVG files
  await Promise.all(
    svgFiles.map(async (file) => {
      try {
        const text = await file.text();
        const item = await parseSvgText(text, file.name);
        if (item) results.push(item);
      } catch { /* skip unreadable files */ }
    })
  );

  // ZIP files — extract SVGs inside
  for (const zipFile of zipFiles) {
    try {
      const zip = await JSZip.loadAsync(zipFile);
      const entries = [];
      zip.forEach((path, entry) => {
        if (!entry.dir && /\.svg$/i.test(path)) entries.push({ path, entry });
      });
      await Promise.all(
        entries.map(async ({ path, entry }) => {
          try {
            const text = await entry.async("string");
            const filename = path.split("/").pop();
            const item = await parseSvgText(text, filename);
            if (item) results.push(item);
          } catch { /* skip unreadable entries */ }
        })
      );
    } catch { /* skip unreadable ZIPs */ }
  }

  return results;
}

// ── DropZone ───────────────────────────────────────────────────────────────

function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const svgRef    = useRef(null);
  const folderRef = useRef(null);
  const zipRef    = useRef(null);

  // webkitdirectory must be set imperatively — not a standard React prop
  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute("webkitdirectory", "");
      folderRef.current.setAttribute("multiple", "");
    }
  }, []);

  async function handle(files) {
    if (!files?.length) return;
    setProcessing(true);
    const items = await processFileList(files);
    setProcessing(false);
    if (items.length) onFiles(items);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handle(e.dataTransfer.files);
  }

  function onDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={
        "rounded-2xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-6 py-20 px-8 text-center cursor-default " +
        (dragging
          ? "border-stone-500 bg-stone-100"
          : "border-stone-300 bg-white hover:border-stone-400")
      }
    >
      <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center">
        {processing ? (
          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#78716C" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3v3M12 18v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M3 12h3M18 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#78716C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-stone-700 mb-1">
          {processing ? "Reading files…" : "Drop SVG files or a ZIP here"}
        </p>
        <p className="text-xs text-stone-400">
          Individual SVG files, a folder of SVGs, or a ZIP archive
        </p>
      </div>

      {!processing && (
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={() => svgRef.current?.click()}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition text-stone-600"
          >
            Choose SVG files
          </button>
          <button
            onClick={() => folderRef.current?.click()}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition text-stone-600"
          >
            Choose folder
          </button>
          <button
            onClick={() => zipRef.current?.click()}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition text-stone-600"
          >
            Choose ZIP
          </button>
        </div>
      )}

      <input ref={svgRef} type="file" multiple accept="image/svg+xml,.svg" style={{ display: "none" }}
        onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
      <input ref={folderRef} type="file" accept="image/svg+xml,.svg" style={{ display: "none" }}
        onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
      <input ref={zipRef} type="file" accept=".zip,application/zip" style={{ display: "none" }}
        onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

// ── StyleBadge ─────────────────────────────────────────────────────────────

function StyleBadge({ style }) {
  const cls = {
    line:    "bg-blue-50 text-blue-700",
    filled:  "bg-purple-50 text-purple-700",
    duotone: "bg-amber-50 text-amber-700",
  }[style] ?? "bg-stone-100 text-stone-600";
  return (
    <span className={"px-2 py-0.5 rounded-md text-xs font-medium " + cls}>
      {style}
    </span>
  );
}

// ── ReviewList ─────────────────────────────────────────────────────────────

function ReviewList({ items, onUpdateName, onRemove }) {
  return (
    <div>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-stone-50 group"
        >
          {/* Thumbnail */}
          <div
            className="w-9 h-9 flex-none rounded-lg border border-stone-200 bg-white flex items-center justify-center shrink-0"
            style={{ color: NEUTRAL }}
            dangerouslySetInnerHTML={{ __html: sizedSvg(item.svg, 22) }}
          />

          {/* Name — editable */}
          <input
            value={item.name}
            onChange={(e) => onUpdateName(item.id, e.target.value)}
            className="flex-1 min-w-0 text-sm bg-transparent border-b border-transparent focus:border-stone-300 focus:outline-none text-stone-700 py-0.5 truncate"
          />

          {/* Style badge */}
          <div className="flex-none">
            <StyleBadge style={item.style} />
          </div>

          {/* File size */}
          <span
            className="text-xs text-stone-400 w-12 text-right tabular-nums flex-none"
            style={mono}
          >
            {item.size >= 1024
              ? `${(item.size / 1024).toFixed(1)}k`
              : `${item.size}b`}
          </span>

          {/* Remove */}
          <button
            onClick={() => onRemove(item.id)}
            className="w-5 h-5 flex-none flex items-center justify-center text-stone-300 hover:text-stone-600 opacity-0 group-hover:opacity-100 transition"
            aria-label={`Remove ${item.name}`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── AddMore (inline file pickers for review stage) ─────────────────────────

function AddMore({ onFiles }) {
  const [processing, setProcessing] = useState(false);
  const svgRef = useRef(null);
  const zipRef = useRef(null);

  async function handle(files) {
    if (!files?.length) return;
    setProcessing(true);
    const items = await processFileList(files);
    setProcessing(false);
    if (items.length) onFiles(items);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => svgRef.current?.click()}
        disabled={processing}
        className="text-xs font-medium px-3 py-2 rounded-lg border border-dashed border-stone-300 text-stone-400 hover:border-stone-400 hover:text-stone-600 transition disabled:opacity-50"
      >
        {processing ? "Reading…" : "+ Add SVG files"}
      </button>
      <button
        onClick={() => zipRef.current?.click()}
        disabled={processing}
        className="text-xs font-medium px-3 py-2 rounded-lg border border-dashed border-stone-300 text-stone-400 hover:border-stone-400 hover:text-stone-600 transition disabled:opacity-50"
      >
        {processing ? "Reading…" : "+ Add ZIP"}
      </button>
      <input ref={svgRef} type="file" multiple accept="image/svg+xml,.svg" style={{ display: "none" }}
        onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
      <input ref={zipRef} type="file" accept=".zip,application/zip" style={{ display: "none" }}
        onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

// ── Main Import workspace ──────────────────────────────────────────────────

export default function Import() {
  const navigate = useNavigate();

  const [stage,    setStage]    = useState("drop"); // drop | review | importing | done
  const [items,    setItems]    = useState([]);
  const [aiTag,    setAiTag]    = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: "" });
  const [summary,  setSummary]  = useState({ added: 0, updated: 0, skipped: 0, errors: 0 });

  // Merge incoming parsed items, dedup by hash
  const mergeItems = useCallback((incoming) => {
    setItems((prev) => {
      const seen = new Set(prev.map((i) => i.hash));
      const fresh = incoming.filter((i) => !seen.has(i.hash));
      return [...prev, ...fresh];
    });
    setStage("review");
  }, []);

  function updateName(id, name) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  }

  function removeItem(id) {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      if (next.length === 0) setStage("drop");
      return next;
    });
  }

  function reset() {
    setItems([]);
    setProgress({ current: 0, total: 0, name: "" });
    setSummary({ added: 0, updated: 0, skipped: 0, errors: 0 });
    setStage("drop");
  }

  async function runImport() {
    if (!isConfigured || !supabase || items.length === 0) return;
    setStage("importing");

    let added = 0, updated = 0, skipped = 0, errors = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setProgress({ current: i + 1, total: items.length, name: item.filename });

      try {
        let name = item.name;
        let descriptive_tags = [];

        // Optional AI enrichment — runs sequentially per icon
        if (aiTag) {
          try {
            const { data: tagData } = await supabase.functions.invoke("tag-icon", {
              body: { svg: item.svg, hint: item.name },
            });
            if (tagData?.name)  name = tagData.name;
            if (tagData?.tags)  descriptive_tags = tagData.tags;
          } catch { /* tagging failed — keep filename-derived name */ }
        }

        // Check for an existing icon with the same content hash
        const { data: existing } = await supabase
          .from("icons")
          .select("id")
          .eq("content_hash", item.hash)
          .maybeSingle();

        if (existing) {
          // Hash match: update metadata only when AI tagging enriched it
          if (aiTag && descriptive_tags.length > 0) {
            await supabase
              .from("icons")
              .update({ name, descriptive_tags })
              .eq("id", existing.id);
            updated++;
          } else {
            skipped++;
          }
        } else {
          // New icon — insert
          const { error: insertErr } = await supabase.from("icons").insert({
            name,
            svg: item.svg,
            style: item.style,
            stroke_width: item.stroke_width,
            corners: item.corners,
            source: "imported",
            brand_availability: ALL_BRAND_IDS,
            descriptive_tags,
            content_hash: item.hash,
          });
          if (insertErr) throw insertErr;
          added++;
        }
      } catch {
        errors++;
      }
    }

    setSummary({ added, updated, skipped, errors });
    setStage("done");
  }

  // ── Not configured ────────────────────────────────────────────────────────
  if (!isConfigured) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="w-12 h-12 rounded-xl border border-dashed border-stone-300 flex items-center justify-center mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="text-sm font-medium text-stone-600 mb-1">Connect your database first</p>
        <p className="text-xs text-stone-400 max-w-xs leading-relaxed">
          Import requires Supabase credentials in{" "}
          <code className="font-mono bg-stone-100 px-1 rounded">.env</code>.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-stone-50 text-stone-900">

      {/* Workspace header */}
      <div className="flex-none border-b border-stone-200 bg-white px-6 py-3">
        <p className="text-sm font-semibold tracking-tight">Import</p>
        <p className="text-xs text-stone-400 mt-0.5">
          Add SVG icons to your library in bulk
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

          {/* ── Stage: drop ── */}
          {stage === "drop" && (
            <DropZone onFiles={mergeItems} />
          )}

          {/* ── Stage: review ── */}
          {stage === "review" && (
            <>
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-stone-800">
                    {items.length} icon{items.length !== 1 ? "s" : ""} ready
                  </h2>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Edit names before importing. Style is guessed from the SVG.
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="text-xs text-stone-400 hover:text-stone-600 underline"
                >
                  Clear all
                </button>
              </div>

              {/* Review list */}
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                {/* Column headers */}
                <div className="flex items-center gap-3 px-3 py-2 border-b border-stone-100">
                  <div className="w-9 flex-none" />
                  <div className="flex-1 text-xs font-medium text-stone-400 uppercase tracking-wide">Name</div>
                  <div className="flex-none text-xs font-medium text-stone-400 uppercase tracking-wide">Style</div>
                  <div className="w-12 text-right text-xs font-medium text-stone-400 uppercase tracking-wide flex-none">Size</div>
                  <div className="w-5 flex-none" />
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  <ReviewList
                    items={items}
                    onUpdateName={updateName}
                    onRemove={removeItem}
                  />
                </div>
              </div>

              {/* Add more */}
              <AddMore onFiles={mergeItems} />

              {/* Options panel */}
              <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                  Import options
                </p>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aiTag}
                    onChange={(e) => setAiTag(e.target.checked)}
                    className="w-3.5 h-3.5 mt-0.5 accent-stone-900 rounded flex-none"
                  />
                  <div>
                    <p className="text-sm text-stone-700">Auto-tag with AI</p>
                    <p className="text-xs text-stone-400 mt-0.5 leading-relaxed">
                      Calls Claude for each icon to generate a clean name and search
                      tags. Slower, but produces a permanently better library.
                      Recommended for a first-time bulk import.
                    </p>
                  </div>
                </label>

                <div
                  className="text-xs text-stone-500 bg-stone-50 border border-stone-100 rounded-lg px-3 py-2.5 leading-relaxed"
                  style={mono}
                >
                  All icons are imported as available to all four brands. Brand
                  availability can be adjusted per-icon in the library.
                </div>
              </div>

              {/* Import button */}
              <button
                onClick={runImport}
                className="w-full bg-stone-900 text-white text-sm font-medium py-3 rounded-xl hover:bg-stone-800 transition flex items-center justify-center gap-2"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Import {items.length} icon{items.length !== 1 ? "s" : ""} to library
              </button>
            </>
          )}

          {/* ── Stage: importing ── */}
          {stage === "importing" && (
            <div className="bg-white border border-stone-200 rounded-2xl p-10 flex flex-col items-center gap-6">
              <div className="text-center">
                <p className="text-sm font-semibold text-stone-800 mb-1">Importing…</p>
                <p className="text-xs text-stone-400" style={mono}>
                  {progress.current} of {progress.total}
                  {progress.name ? ` · ${progress.name}` : ""}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-sm bg-stone-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-stone-900 h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${
                      progress.total > 0
                        ? Math.round((progress.current / progress.total) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>

              {aiTag && (
                <p className="text-xs text-stone-400 text-center">
                  AI tagging is on — Claude is enriching each icon with a clean
                  name and search tags.
                </p>
              )}
            </div>
          )}

          {/* ── Stage: done ── */}
          {stage === "done" && (
            <div className="bg-white border border-stone-200 rounded-2xl p-10 flex flex-col items-center gap-6">
              {/* Check */}
              <div className="w-11 h-11 rounded-full bg-stone-900 flex items-center justify-center">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </div>

              <p className="text-base font-semibold text-stone-800">Import complete</p>

              {/* Summary grid */}
              <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
                {[
                  { label: "New",     value: summary.added,   dim: false },
                  { label: "Updated", value: summary.updated, dim: true  },
                  { label: "Skipped", value: summary.skipped, dim: true  },
                ].map(({ label, value, dim }) => (
                  <div
                    key={label}
                    className="bg-stone-50 border border-stone-100 rounded-xl py-4 text-center"
                  >
                    <div
                      className={"text-2xl font-bold tabular-nums " + (dim ? "text-stone-400" : "text-stone-900")}
                      style={mono}
                    >
                      {value}
                    </div>
                    <div className="text-xs text-stone-400 mt-1">{label}</div>
                  </div>
                ))}
              </div>

              {summary.errors > 0 && (
                <p className="text-xs text-amber-700">
                  {summary.errors} icon{summary.errors !== 1 ? "s" : ""} failed to
                  import — they may have been malformed SVGs.
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 w-full max-w-xs">
                <button
                  onClick={reset}
                  className="flex-1 text-sm font-medium py-2.5 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 transition"
                >
                  Import more
                </button>
                <button
                  onClick={() => navigate("/library")}
                  className="flex-1 text-sm font-medium py-2.5 rounded-xl bg-stone-900 text-white hover:bg-stone-800 transition"
                >
                  View library
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
