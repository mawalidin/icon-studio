import React, { useState, useMemo, useRef } from "react";

// ──────────────────────────────────────────────────────────────────────────
// Sample icons (same construction language as the generation module) so you
// can test motion immediately, or paste your own SVG.
// ──────────────────────────────────────────────────────────────────────────
const SAMPLES = {
  bell:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10.5 20.5a1.7 1.7 0 0 0 3 0"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.5 12 20 12 20Z"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  star:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 18.6 6.6 20l1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>',
};

// trigger → presets
const PRESETS = {
  hover: [
    { id: "lift", label: "Lift" },
    { id: "grow", label: "Grow" },
    { id: "rotate", label: "Rotate" },
  ],
  click: [
    { id: "pop", label: "Pop" },
    { id: "bounce", label: "Bounce" },
    { id: "spin", label: "Spin once" },
  ],
  idle: [
    { id: "breathe", label: "Breathe" },
    { id: "float", label: "Float" },
    { id: "spin", label: "Spin" },
    { id: "pulse", label: "Pulse" },
  ],
};

const EASINGS = [
  { id: "ease-in-out", label: "Smooth" },
  { id: "ease-out", label: "Ease out" },
  { id: "linear", label: "Linear" },
  { id: "cubic-bezier(0.34,1.56,0.64,1)", label: "Spring" },
];

const BRAND = "#1B2A4A"; // The Lavana navy default — change via picker

// ──────────────────────────────────────────────────────────────────────────
// CSS generation — single source of truth used by BOTH preview and export.
// ──────────────────────────────────────────────────────────────────────────
function buildCss({ trigger, preset, duration, easing, intensity }) {
  const d = `${duration}ms`;
  const sel = ".icon-anim";

  if (trigger === "hover") {
    const map = {
      lift: `transform: translateY(-${Math.round(2 + intensity * 8)}px);`,
      grow: `transform: scale(${(1 + intensity * 0.25).toFixed(3)});`,
      rotate: `transform: rotate(${Math.round(intensity * 25)}deg);`,
    };
    return `${sel} { transition: transform ${d} ${easing}; }
${sel}:hover { ${map[preset]} }`;
  }

  if (trigger === "click") {
    const amt = intensity;
    const frames = {
      pop: `@keyframes icon-pop { 0%{transform:scale(1)} 40%{transform:scale(${(1 - amt * 0.25).toFixed(3)})} 100%{transform:scale(1)} }`,
      bounce: `@keyframes icon-bounce { 0%{transform:translateY(0)} 30%{transform:translateY(-${Math.round(4 + amt * 10)}px)} 60%{transform:translateY(0)} 80%{transform:translateY(-${Math.round((4 + amt * 10) / 3)}px)} 100%{transform:translateY(0)} }`,
      spin: `@keyframes icon-spin-once { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }`,
    };
    const name = { pop: "icon-pop", bounce: "icon-bounce", spin: "icon-spin-once" }[preset];
    return `${frames[preset]}
${sel}.is-active { animation: ${name} ${d} ${easing}; }`;
  }

  // idle (looping)
  const amt = intensity;
  const frames = {
    breathe: `@keyframes icon-breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(${(1 + amt * 0.12).toFixed(3)})} }`,
    float: `@keyframes icon-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-${Math.round(2 + amt * 8)}px)} }`,
    spin: `@keyframes icon-spin { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }`,
    pulse: `@keyframes icon-pulse { 0%,100%{opacity:1} 50%{opacity:${(1 - amt * 0.6).toFixed(2)}} }`,
  };
  const name = { breathe: "icon-breathe", float: "icon-float", spin: "icon-spin", pulse: "icon-pulse" }[preset];
  const loopEase = preset === "spin" ? "linear" : easing;
  return `${frames[preset]}
${sel} { animation: ${name} ${d} ${loopEase} infinite; }`;
}

// ──────────────────────────────────────────────────────────────────────────
// Lottie generation (idle + click only). Embeds the icon as a rasterized
// image layer and animates its transform — a genuinely usable .json.
// ──────────────────────────────────────────────────────────────────────────
function rasterize(svg, color, px) {
  return new Promise((resolve, reject) => {
    const baked = svg.replace(/currentColor/g, color).replace(
      /<svg([^>]*)>/i,
      `<svg$1 width="${px}" height="${px}">`
    );
    const blob = new Blob([baked], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = px;
      c.height = px;
      c.getContext("2d").drawImage(img, 0, 0, px, px);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function lottieKeyframes(trigger, preset, intensity, totalFrames) {
  // returns partial transform keyframe sets: { s?, p?, r?, o? }
  const mid = Math.round(totalFrames / 2);
  const e = { i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } };
  const k = (t, s) => ({ t, s, ...(t < totalFrames ? e : {}) });

  if (trigger === "idle") {
    if (preset === "breathe") {
      const p = 100 + intensity * 12;
      return { s: { a: 1, k: [k(0, [100, 100, 100]), k(mid, [p, p, 100]), { t: totalFrames, s: [100, 100, 100] }] } };
    }
    if (preset === "float") {
      const dy = 2 + intensity * 8;
      return { p: { a: 1, k: [k(0, [128, 128, 0]), k(mid, [128, 128 - dy, 0]), { t: totalFrames, s: [128, 128, 0] }] } };
    }
    if (preset === "spin") {
      return { r: { a: 1, k: [{ t: 0, s: [0], i: { x: [0], y: [0] }, o: { x: [1], y: [1] } }, { t: totalFrames, s: [360] }] } };
    }
    if (preset === "pulse") {
      const o = 100 - intensity * 60;
      return { o: { a: 1, k: [k(0, [100]), k(mid, [o]), { t: totalFrames, s: [100] }] } };
    }
  }
  // click (one-shot)
  if (preset === "pop") {
    const s = 100 - intensity * 25;
    const q = Math.round(totalFrames * 0.4);
    return { s: { a: 1, k: [k(0, [100, 100, 100]), k(q, [s, s, 100]), { t: totalFrames, s: [100, 100, 100] }] } };
  }
  if (preset === "bounce") {
    const dy = 4 + intensity * 10;
    return { p: { a: 1, k: [k(0, [128, 128, 0]), k(Math.round(totalFrames * 0.3), [128, 128 - dy, 0]), { t: totalFrames, s: [128, 128, 0] }] } };
  }
  if (preset === "spin") {
    return { r: { a: 1, k: [{ t: 0, s: [0], i: { x: [0], y: [0] }, o: { x: [1], y: [1] } }, { t: totalFrames, s: [360] }] } };
  }
  return {};
}

async function buildLottie({ svg, color, trigger, preset, duration, intensity }) {
  const SIZE = 256;
  const png = await rasterize(svg, color, SIZE);
  const fr = 60;
  const op = Math.max(1, Math.round((duration / 1000) * fr));
  const tf = lottieKeyframes(trigger, preset, intensity, op);

  const ks = {
    o: tf.o || { a: 0, k: 100 },
    r: tf.r || { a: 0, k: 0 },
    p: tf.p || { a: 0, k: [128, 128, 0] },
    a: { a: 0, k: [128, 128, 0] },
    s: tf.s || { a: 0, k: [100, 100, 100] },
  };

  return {
    v: "5.7.4",
    fr,
    ip: 0,
    op,
    w: SIZE,
    h: SIZE,
    nm: `${preset}-${trigger}`,
    ddd: 0,
    assets: [{ id: "icon_0", w: SIZE, h: SIZE, u: "", p: png, e: 1 }],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 2,
        nm: "icon",
        refId: "icon_0",
        sr: 1,
        ks,
        ao: 0,
        ip: 0,
        op,
        st: 0,
        bm: 0,
      },
    ],
  };
}

function download(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────────────────────────────────────
// GIF export — load gif.js from CDN, render each animation frame to canvas,
// encode. The worker is fetched and blob-wrapped so it runs same-origin
// inside the sandboxed iframe.
// ──────────────────────────────────────────────────────────────────────────
let _gifLoading, _workerUrl;
function ensureGif() {
  if (typeof window !== "undefined" && window.GIF) return Promise.resolve();
  if (_gifLoading) return _gifLoading;
  _gifLoading = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js";
    s.onload = res;
    s.onerror = () => rej(new Error("Could not load encoder"));
    document.head.appendChild(s);
  });
  return _gifLoading;
}
async function workerUrl() {
  if (_workerUrl) return _workerUrl;
  const r = await fetch("https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js");
  const txt = await r.text();
  _workerUrl = URL.createObjectURL(new Blob([txt], { type: "application/javascript" }));
  return _workerUrl;
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}
function bouncePath(p, up) {
  if (p < 0.3) return up * (p / 0.3);
  if (p < 0.6) return up * (1 - (p - 0.3) / 0.3);
  if (p < 0.8) return (up / 3) * ((p - 0.6) / 0.2);
  return (up / 3) * (1 - (p - 0.8) / 0.2);
}
// Transform at loop progress p (0..1), mirroring the CSS presets.
function frameTransform(trigger, preset, intensity, p) {
  const amt = intensity;
  const T = { s: 1, tx: 0, ty: 0, r: 0, o: 1 };
  const wave = Math.sin(p * Math.PI); // 0 → 1 → 0
  if (trigger === "idle") {
    if (preset === "breathe") T.s = 1 + amt * 0.12 * wave;
    else if (preset === "float") T.ty = -(2 + amt * 8) * wave;
    else if (preset === "spin") T.r = 360 * p;
    else if (preset === "pulse") T.o = 1 - amt * 0.6 * wave;
  } else if (trigger === "click") {
    if (preset === "pop") {
      const low = 1 - amt * 0.25;
      T.s = p < 0.4 ? 1 + (low - 1) * (p / 0.4) : low + (1 - low) * ((p - 0.4) / 0.6);
    } else if (preset === "bounce") {
      T.ty = -bouncePath(p, 4 + amt * 10);
    } else if (preset === "spin") {
      T.r = 360 * p;
    }
  } else {
    // hover → there-and-back loop so the GIF reads as a preview
    if (preset === "lift") T.ty = -(2 + amt * 8) * wave;
    else if (preset === "grow") T.s = 1 + amt * 0.25 * wave;
    else if (preset === "rotate") T.r = amt * 25 * wave;
  }
  return T;
}

// ──────────────────────────────────────────────────────────────────────────
// SVG import helpers — sanitize, normalize, and color handling for uploads.
// ──────────────────────────────────────────────────────────────────────────
function sanitizeSvg(raw) {
  if (!raw) return "";
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

function normalizeImportedSvg(raw) {
  const start = raw.indexOf("<svg");
  const end = raw.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return null;
  let s = raw.slice(start, end + 6);
  s = s.replace(/<svg([^>]*)>/i, (m, attrs) => {
    let a = attrs;
    const wm = a.match(/\swidth="([\d.]+)(?:px)?"/i);
    const hm = a.match(/\sheight="([\d.]+)(?:px)?"/i);
    a = a.replace(/\swidth="[^"]*"/i, "").replace(/\sheight="[^"]*"/i, "");
    if (!/viewBox=/i.test(a)) {
      a += wm && hm ? ` viewBox="0 0 ${wm[1]} ${hm[1]}"` : ' viewBox="0 0 24 24"';
    }
    return `<svg${a}>`;
  });
  return s;
}

function hasHardcodedColors(svg) {
  const m = svg.match(/(?:fill|stroke)\s*[:=]\s*["']?\s*(?:#|rgb|hsl|[a-z]{3,})/gi);
  return !!m && m.some((x) => !/none|currentcolor|transparent|inherit/i.test(x));
}

function forceCurrentColor(svg) {
  if (!svg) return svg;
  const keep = (v) => /^(none|currentcolor|transparent|inherit)$/i.test(v.trim());
  return svg
    .replace(/(fill|stroke)="([^"]*)"/gi, (m, p, v) => (keep(v) ? m : `${p}="currentColor"`))
    .replace(/(fill|stroke)\s*:\s*([^;"'}]+)/gi, (m, p, v) => (keep(v) ? m : `${p}:currentColor`));
}

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
              "flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition " +
              (active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700")
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
      <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">{children}</span>
      {value != null && (
        <span className="text-xs text-stone-700" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
          {value}
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
export default function IconMotion() {
  const [svg, setSvg] = useState(SAMPLES.bell);
  const [color, setColor] = useState(BRAND);
  const [trigger, setTrigger] = useState("hover");
  const [preset, setPreset] = useState("lift");
  const [duration, setDuration] = useState(trigger === "idle" ? 2000 : 300);
  const [easing, setEasing] = useState("ease-in-out");
  const [intensity, setIntensity] = useState(0.5);
  const [active, setActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [building, setBuilding] = useState(false);
  const [gifState, setGifState] = useState("idle"); // idle | building | error
  const [gifPct, setGifPct] = useState(0);
  const [gifBg, setGifBg] = useState("#ffffff");
  const [colorMode, setColorMode] = useState("brand"); // brand | original
  const [uploadInfo, setUploadInfo] = useState(null);
  const fileRef = useRef(null);
  const iconRef = useRef(null);

  const presetList = PRESETS[trigger];

  function changeTrigger(t) {
    setTrigger(t);
    setPreset(PRESETS[t][0].id);
    setDuration(t === "idle" ? 2000 : 300);
  }

  const css = useMemo(
    () => buildCss({ trigger, preset, duration, easing, intensity }),
    [trigger, preset, duration, easing, intensity]
  );

  // Color-aware icon used by preview, raster (GIF), and Lottie alike.
  const renderSvg = useMemo(
    () => (colorMode === "brand" ? forceCurrentColor(svg) : svg),
    [svg, colorMode]
  );

  function handleUpload(file) {
    if (!file) return;
    const kb = file.size / 1024;
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if (!isSvg) {
      setUploadInfo({
        name: file.name,
        kb: kb.toFixed(1),
        error: true,
        warn: "Not an SVG. This module is SVG-first — PNG/JPG aren't supported here.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const norm = normalizeImportedSvg(sanitizeSvg(String(reader.result)));
      if (!norm) {
        setUploadInfo({ name: file.name, kb: kb.toFixed(1), error: true, warn: "No valid <svg> found in this file." });
        return;
      }
      setSvg(norm);
      setColorMode(hasHardcodedColors(norm) ? "original" : "brand");
      let warn = null;
      if (kb > 50) warn = "Large file — optimize at svgomg.net before using.";
      else if (kb > 15) warn = "A little heavy — optimizing with SVGO is recommended.";
      setUploadInfo({ name: file.name, kb: kb.toFixed(1), error: false, warn });
    };
    reader.readAsText(file);
  }

  function triggerClick() {
    if (trigger !== "click") return;
    setActive(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setActive(true)));
  }

  function copyCss() {
    const usage =
      trigger === "click"
        ? `\n\n/* Usage: toggle the .is-active class on click, remove on animationend */`
        : trigger === "idle"
        ? `\n\n/* Usage: apply .icon-anim — animation runs automatically */`
        : `\n\n/* Usage: apply .icon-anim — animates on hover */`;
    navigator.clipboard?.writeText(css + usage);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function downloadLottie() {
    setBuilding(true);
    try {
      const json = await buildLottie({ svg: renderSvg, color, trigger, preset, duration, intensity });
      download(JSON.stringify(json), `icon_${preset}_${trigger}.json`, "application/json");
    } finally {
      setBuilding(false);
    }
  }

  async function exportGif() {
    setGifState("building");
    setGifPct(0);
    try {
      await ensureGif();
      const wurl = await workerUrl();
      const png = await rasterize(renderSvg, color, 256);
      const img = await loadImage(png);

      const W = 240, H = 240, icon = 150;
      const N = Math.min(48, Math.max(12, Math.round((duration / 1000) * 30)));
      const delay = Math.max(20, Math.round(duration / N));

      const gif = new window.GIF({
        workers: 2,
        quality: 8,
        width: W,
        height: H,
        workerScript: wurl,
        transparent: null,
      });

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");

      for (let i = 0; i < N; i++) {
        const p = i / N;
        const t = frameTransform(trigger, preset, intensity, p);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = gifBg;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.translate(W / 2 + t.tx, H / 2 + t.ty);
        ctx.rotate((t.r * Math.PI) / 180);
        ctx.scale(t.s, t.s);
        ctx.globalAlpha = t.o;
        ctx.drawImage(img, -icon / 2, -icon / 2, icon, icon);
        ctx.restore();
        gif.addFrame(ctx, { copy: true, delay });
      }

      gif.on("progress", (p) => setGifPct(Math.round(p * 100)));
      gif.on("finished", (blob) => {
        download(blob, `icon_${preset}_${trigger}.gif`);
        setGifState("idle");
      });
      gif.render();
    } catch (e) {
      setGifState("error");
    }
  }

  const sizedSvg = renderSvg.replace(/<svg([^>]*)>/i, `<svg$1 width="64" height="64" style="display:block">`);
  const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
  const lottieAvailable = trigger !== "hover";

  return (
    <div className="w-full bg-stone-50 text-stone-900" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{css}</style>

      <div className="border-b border-stone-200 bg-white px-6 py-4">
        <h1 className="text-base font-semibold tracking-tight">Icon Motion</h1>
        <p className="text-xs text-stone-500 mt-0.5">Micro-interaction module · hover, click, idle</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "320px 1fr" }}>
        {/* Controls */}
        <div className="border-r border-stone-200 bg-white p-5 space-y-6">
          <div>
            <Label>Icon</Label>
            <div className="flex gap-2 mb-2">
              {Object.entries(SAMPLES).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setSvg(v)}
                  className={
                    "w-10 h-10 rounded-lg border flex items-center justify-center transition " +
                    (svg === v ? "border-stone-900" : "border-stone-200 hover:border-stone-400")
                  }
                  style={{ color }}
                  dangerouslySetInnerHTML={{
                    __html: v.replace(/<svg([^>]*)>/i, `<svg$1 width="22" height="22">`),
                  }}
                />
              ))}
            </div>
            <textarea
              value={svg}
              onChange={(e) => setSvg(e.target.value)}
              rows={3}
              spellCheck={false}
              className="w-full text-xs border border-stone-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-stone-300"
              style={mono}
              placeholder="Paste an SVG…"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full mt-2 text-sm font-medium py-2 rounded-lg border border-stone-200 hover:bg-stone-50 transition flex items-center justify-center gap-2"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M7 9l5-5 5 5" />
                <path d="M5 20h14" />
              </svg>
              Upload SVG
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/svg+xml,.svg"
              style={{ display: "none" }}
              onChange={(e) => {
                handleUpload(e.target.files && e.target.files[0]);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-stone-400 mt-1.5">
              SVG only · ideal under 15&nbsp;KB. Heavier files optimize well at svgomg.net.
            </p>
            {uploadInfo && (
              <p
                className={
                  "text-xs mt-1 " +
                  (uploadInfo.error ? "text-red-600" : uploadInfo.warn ? "text-amber-700" : "text-stone-500")
                }
              >
                {uploadInfo.name} · {uploadInfo.kb}&nbsp;KB
                {uploadInfo.warn ? ` — ${uploadInfo.warn}` : uploadInfo.error ? "" : " ✓"}
              </p>
            )}
            <div className="mt-3">
              <Label>Coloring</Label>
              <Segmented
                options={[
                  { id: "brand", label: "Brand color" },
                  { id: "original", label: "Original" },
                ]}
                value={colorMode}
                onChange={setColorMode}
              />
              <p className="text-xs text-stone-400 mt-1.5">
                {colorMode === "brand"
                  ? "Recolors the icon to the brand color below."
                  : "Keeps the icon's own colors (best for multicolor marks)."}
              </p>
            </div>
          </div>

          <div>
            <Label>Trigger</Label>
            <Segmented
              options={[
                { id: "hover", label: "Hover" },
                { id: "click", label: "Click" },
                { id: "idle", label: "Idle" },
              ]}
              value={trigger}
              onChange={changeTrigger}
            />
          </div>

          <div>
            <Label>Preset</Label>
            <Segmented options={presetList} value={preset} onChange={setPreset} />
          </div>

          <div>
            <Label value={`${duration}ms`}>Duration</Label>
            <input
              type="range"
              min={trigger === "idle" ? 800 : 150}
              max={trigger === "idle" ? 4000 : 800}
              step={50}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full accent-stone-800"
            />
          </div>

          <div>
            <Label value={`${Math.round(intensity * 100)}%`}>Intensity</Label>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              className="w-full accent-stone-800"
            />
          </div>

          <div>
            <Label>Easing</Label>
            <Segmented options={EASINGS} value={easing} onChange={setEasing} />
          </div>

          <div>
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-9 h-9 rounded-lg border border-stone-200 cursor-pointer p-0.5 bg-white"
              />
              <span className="text-sm text-stone-700" style={mono}>
                {color.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Stage + export */}
        <div className="p-6">
          <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 320px" }}>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">
                Preview{trigger === "hover" ? " — hover the icon" : trigger === "click" ? " — click the icon" : ""}
              </p>
              <div className="bg-white border border-stone-200 rounded-xl flex items-center justify-center" style={{ height: 280 }}>
                <div
                  ref={iconRef}
                  className={"icon-anim" + (active ? " is-active" : "")}
                  onClick={triggerClick}
                  onAnimationEnd={() => setActive(false)}
                  style={{ color, cursor: trigger === "click" ? "pointer" : "default", display: "inline-flex" }}
                  dangerouslySetInnerHTML={{ __html: sizedSvg }}
                />
              </div>
              <div className="flex gap-3 mt-3">
                <div className="flex-1 bg-white border border-stone-200 rounded-lg py-3 flex items-center justify-center" style={{ color }}>
                  <div className={"icon-anim" + (active ? " is-active" : "")} style={{ color }}
                    dangerouslySetInnerHTML={{ __html: renderSvg.replace(/<svg([^>]*)>/i, `<svg$1 width="20" height="20">`) }} />
                  <span className="text-xs text-stone-400 ml-2" style={mono}>20px</span>
                </div>
                <div className="flex-1 bg-white border border-stone-200 rounded-lg py-3 flex items-center justify-center" style={{ color }}>
                  <div className={"icon-anim" + (active ? " is-active" : "")} style={{ color }}
                    dangerouslySetInnerHTML={{ __html: renderSvg.replace(/<svg([^>]*)>/i, `<svg$1 width="32" height="32">`) }} />
                  <span className="text-xs text-stone-400 ml-2" style={mono}>32px</span>
                </div>
              </div>
            </div>

            {/* Export */}
            <div className="space-y-4">
              <div className="bg-white border border-stone-200 rounded-xl p-4">
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">CSS</p>
                <pre className="text-xs bg-stone-50 border border-stone-100 rounded-lg p-3 overflow-x-auto" style={{ ...mono, maxHeight: 160 }}>
                  {css}
                </pre>
                <button
                  onClick={copyCss}
                  className="w-full mt-3 text-sm font-medium py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition"
                >
                  {copied ? "Copied ✓" : "Copy CSS"}
                </button>
              </div>

              <div className="bg-white border border-stone-200 rounded-xl p-4">
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Lottie JSON</p>
                {lottieAvailable ? (
                  <>
                    <p className="text-xs text-stone-500 mb-3">
                      Embeds the icon as an image layer with the motion baked in.
                    </p>
                    <button
                      onClick={downloadLottie}
                      disabled={building}
                      className="w-full text-sm font-medium py-2 rounded-lg border border-stone-200 hover:bg-stone-50 transition disabled:opacity-50"
                    >
                      {building ? "Building…" : "Download .json"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-stone-500">
                    Hover is a CSS-native interaction — use the CSS export. Lottie is available for click and idle.
                  </p>
                )}
              </div>

              <div className="bg-white border border-stone-200 rounded-xl p-4">
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">GIF</p>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="color"
                    value={gifBg}
                    onChange={(e) => setGifBg(e.target.value)}
                    className="w-7 h-7 rounded-md border border-stone-200 cursor-pointer p-0.5 bg-white"
                    title="Background color"
                  />
                  <span className="text-xs text-stone-500">Background ({gifBg.toUpperCase()})</span>
                </div>
                <button
                  onClick={exportGif}
                  disabled={gifState === "building"}
                  className="w-full text-sm font-medium py-2 rounded-lg border border-stone-200 hover:bg-stone-50 transition disabled:opacity-50"
                >
                  {gifState === "building" ? `Encoding… ${gifPct}%` : "Download .gif"}
                </button>
                {gifState === "error" && (
                  <p className="text-xs text-amber-700 mt-2">
                    The encoder couldn't run in this sandbox. It works in the production build — or try once more.
                  </p>
                )}
                <p className="text-xs text-stone-400 mt-2">
                  Flat icons GIF cleanly. Use a background that matches where it'll sit, since GIF edges don't anti-alias to transparency well.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
