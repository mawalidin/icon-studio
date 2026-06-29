// Strip code fences the model may add and extract the <svg>…</svg> block.
export function cleanSvg(raw) {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^```(?:svg|html|xml)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("<svg");
  const end = s.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return null;
  return s.slice(start, end + 6);
}

// Remove fixed width/height from the root <svg> so it scales with CSS.
// Adds a viewBox="0 0 24 24" if absent.
export function normalizeSvg(svg) {
  if (!svg) return svg;
  return svg.replace(/<svg([^>]*)>/i, (_, attrs) => {
    let a = attrs
      .replace(/\swidth="[^"]*"/i, "")
      .replace(/\sheight="[^"]*"/i, "");
    if (!/viewBox=/i.test(a)) a += ' viewBox="0 0 24 24"';
    return `<svg${a}>`;
  });
}

// Like normalizeSvg but also reconstructs viewBox from width/height when missing.
export function normalizeImportedSvg(raw) {
  const start = raw.indexOf("<svg");
  const end = raw.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return null;
  let s = raw.slice(start, end + 6);
  s = s.replace(/<svg([^>]*)>/i, (_, attrs) => {
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

// Strip <script>, <foreignObject>, and inline event handlers.
export function sanitizeSvg(raw) {
  if (!raw) return "";
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

// Replace currentColor with a concrete hex so the SVG is self-contained.
export function bakeColor(svg, color) {
  if (!svg) return svg;
  return svg.replace(/currentColor/g, color);
}

// Replace every hardcoded fill/stroke with currentColor for theming.
export function forceCurrentColor(svg) {
  if (!svg) return svg;
  const keep = (v) => /^(none|currentcolor|transparent|inherit)$/i.test(v.trim());
  return svg
    .replace(/(fill|stroke)="([^"]*)"/gi, (m, p, v) => (keep(v) ? m : `${p}="currentColor"`))
    .replace(/(fill|stroke)\s*:\s*([^;"'}]+)/gi, (m, p, v) => (keep(v) ? m : `${p}:currentColor`));
}

// True if the SVG contains any non-keyword color value.
export function hasHardcodedColors(svg) {
  const m = svg.match(/(?:fill|stroke)\s*[:=]\s*["']?\s*(?:#|rgb|hsl|[a-z]{3,})/gi);
  return !!m && m.some((x) => !/none|currentcolor|transparent|inherit/i.test(x));
}

// Inject an explicit width/height so the SVG renders at a known pixel size.
export function sizedSvg(svg, px) {
  if (!svg) return "";
  return svg.replace(
    /<svg([^>]*)>/i,
    `<svg$1 width="${px}" height="${px}" style="display:block">`
  );
}

// Rasterize an SVG string to a data URL at px × px.
export function rasterize(svg, color, px) {
  return new Promise((resolve, reject) => {
    const baked = bakeColor(svg, color).replace(
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
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Rasterization failed"));
    };
    img.src = url;
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Normalize any square SVG to a 24×24 viewBox.
// Content is wrapped in a scale transform so proportions are preserved exactly.
// Non-square or non-origin viewBoxes are left unchanged.
export function normalizeToGrid(svg) {
  if (!svg) return svg;
  const vb = svg.match(/viewBox\s*=\s*["']\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (!vb) return svg;
  const [minX, minY, w, h] = [vb[1], vb[2], vb[3], vb[4]].map(Number);
  if (w === 24 && h === 24) return svg;               // already on grid
  if (w !== h || minX !== 0 || minY !== 0) return svg; // non-square or offset — leave as-is
  const scale = parseFloat((24 / w).toFixed(6));
  const out = svg.replace(/viewBox\s*=\s*["'][^"']*["']/i, 'viewBox="0 0 24 24"');
  const openEnd   = out.indexOf(">");
  const closeStart = out.lastIndexOf("</svg>");
  if (openEnd === -1 || closeStart === -1) return svg;
  return (
    out.slice(0, openEnd + 1) +
    `<g transform="scale(${scale})">` +
    out.slice(openEnd + 1, closeStart) +
    `</g></svg>`
  );
}

export function slugify(s) {
  return (s || "icon")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "icon";
}
