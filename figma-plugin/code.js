figma.showUI(__html__, { width: 320, height: 580, themeColors: true });

/* ── Color helpers ─────────────────────────────────────────────────────── */
function paintToColor(paint) {
  if (!paint || paint.type !== "SOLID") return null;
  const { r, g, b } = paint.color;
  const a = paint.opacity !== undefined ? paint.opacity : 1;
  const hex = [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  return a < 1
    ? `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a.toFixed(2)})`
    : `#${hex}`;
}

/* ── SVG path elements from a single VECTOR node ───────────────────────── */
function pathsFromVectorNode(n) {
  const vPaths = n.vectorPaths || [];
  if (!vPaths.length) return "";

  const fills   = (n.fills   || []).filter(f => f.visible !== false);
  const strokes = (n.strokes || []).filter(s => s.visible !== false);

  const fillColor   = fills.length   ? (paintToColor(fills[0])   || "none") : "none";
  const strokeColor = strokes.length ? (paintToColor(strokes[0]) || "none") : "none";
  const strokeW     = n.strokeWeight || 1.5;

  const capMap  = { ROUND: "round", SQUARE: "square", NONE: "butt" };
  const joinMap = { ROUND: "round", BEVEL: "bevel",  MITER: "miter" };
  const cap  = capMap[n.strokeCap]  || "round";
  const join = joinMap[n.strokeJoin] || "round";

  return vPaths.map(vp => {
    const rule = vp.windingRule === "NONZERO" ? "nonzero" : "evenodd";
    const strokeAttrs = strokeColor !== "none"
      ? ` stroke="${strokeColor}" stroke-width="${strokeW}" stroke-linecap="${cap}" stroke-linejoin="${join}"`
      : ' stroke="none"';
    return `<path fill-rule="${rule}" d="${vp.data}" fill="${fillColor}"${strokeAttrs}/>`;
  }).join("");
}

/* ── Recursive gather: walk a node tree, accumulate SVG element strings ── */
function gatherElements(node, offsetX, offsetY) {
  if (node.visible === false) return "";

  const x = node.x + offsetX;
  const y = node.y + offsetY;

  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") {
    const els = pathsFromVectorNode(node);
    if (!els) return "";
    if (x === 0 && y === 0) return els;
    return `<g transform="translate(${x},${y})">${els}</g>`;
  }

  if (["FRAME", "GROUP", "COMPONENT", "COMPONENT_SET", "INSTANCE"].includes(node.type)) {
    return (node.children || []).map(c => gatherElements(c, x, y)).join("");
  }

  return "";
}

/* ── Build a complete SVG string from ANY exportable node ──────────────── */
// Reads vectorPaths and style properties synchronously — never calls exportAsync.
// Returns null when the node contains no renderable vector paths.
function buildSvgFromNode(node) {
  const { width, height } = node;
  if (!width || !height) return null;

  let elements;
  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") {
    elements = pathsFromVectorNode(node);
  } else {
    // FRAME / GROUP / COMPONENT — recurse into children
    elements = (node.children || []).map(c => gatherElements(c, 0, 0)).join("");
  }

  if (!elements) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${elements}</svg>`;
}

/* ── Send current selection (with pre-built SVG) to the UI ─────────────── */
function sendSelection() {
  const sel  = figma.currentPage.selection;
  const node = sel.length === 1 ? sel[0] : null;
  const exportable =
    node &&
    ["FRAME", "COMPONENT", "COMPONENT_SET", "GROUP", "INSTANCE", "VECTOR", "BOOLEAN_OPERATION"].includes(node.type);

  if (!exportable) {
    figma.ui.postMessage({ type: "selection", node: null });
    return;
  }

  const nodeInfo = { id: node.id, name: node.name, type: node.type };
  // Build SVG synchronously so the UI never needs an export-frame round-trip.
  const svg = buildSvgFromNode(node);
  figma.ui.postMessage({ type: "selection", node: nodeInfo, svg: svg || null });
}

figma.on("selectionchange", sendSelection);
sendSelection();

/* ── Messages from UI ──────────────────────────────────────────────────── */
figma.ui.onmessage = (msg) => {
  if (msg.type === "insert-icon") {
    try {
      const node = figma.createNodeFromSvg(msg.svg);
      node.name = msg.name;
      const { x, y } = figma.viewport.center;
      node.x = Math.round(x - node.width / 2);
      node.y = Math.round(y - node.height / 2);
      figma.currentPage.appendChild(node);
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      figma.ui.postMessage({ type: "insert-done", name: msg.name });
    } catch (err) {
      figma.ui.postMessage({ type: "insert-error", error: String(err) });
    }
    return;
  }

  if (msg.type === "close") figma.closePlugin();
};
