figma.showUI(__html__, { width: 320, height: 580, themeColors: true });

// Send current Figma selection to the UI whenever it changes.
function sendSelection() {
  const sel = figma.currentPage.selection;
  const node = sel.length === 1 ? sel[0] : null;
  const exportable =
    node &&
    ["FRAME", "COMPONENT", "COMPONENT_SET", "GROUP", "INSTANCE", "VECTOR", "BOOLEAN_OPERATION"].includes(
      node.type
    );
  figma.ui.postMessage({
    type: "selection",
    node: exportable ? { id: node.id, name: node.name, type: node.type } : null,
  });
}

figma.on("selectionchange", sendSelection);
sendSelection(); // send on open

// Build an SVG string directly from a VECTOR node's path data and style
// properties, avoiding exportAsync which can hang the plugin sandbox.
function vectorNodeToSvg(node) {
  const vPaths = node.vectorPaths || [];
  if (!vPaths.length) return null;

  const { width, height } = node;

  function paintToColor(paint) {
    if (!paint || paint.type !== "SOLID") return null;
    const { r, g, b } = paint.color;
    const a = paint.opacity !== undefined ? paint.opacity : 1;
    const hex = [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
    return a < 1
      ? `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a.toFixed(2)})`
      : `#${hex}`;
  }

  const fills   = (node.fills   || []).filter(f => f.visible !== false);
  const strokes = (node.strokes || []).filter(s => s.visible !== false);

  const fillColor   = fills.length   ? (paintToColor(fills[0])   || "none") : "none";
  const strokeColor = strokes.length ? (paintToColor(strokes[0]) || "none") : "none";
  const strokeW     = node.strokeWeight || 1.5;

  const capMap  = { ROUND: "round", SQUARE: "square", NONE: "butt" };
  const joinMap = { ROUND: "round", BEVEL: "bevel",  MITER: "miter" };
  const cap  = capMap[node.strokeCap]  || "round";
  const join = joinMap[node.strokeJoin] || "round";

  const pathEls = vPaths.map(vp => {
    const rule = vp.windingRule === "NONZERO" ? "nonzero" : "evenodd";
    const strokeAttrs = strokeColor !== "none"
      ? ` stroke="${strokeColor}" stroke-width="${strokeW}" stroke-linecap="${cap}" stroke-linejoin="${join}"`
      : ' stroke="none"';
    return `<path fill-rule="${rule}" d="${vp.data}" fill="${fillColor}"${strokeAttrs}/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${pathEls}</svg>`;
}

figma.ui.onmessage = async (msg) => {

  // ── Export a Figma layer as SVG ──────────────────────────────────────────
  if (msg.type === "export-frame") {
    figma.ui.postMessage({ type: "export-ack" });

    const node = figma.getNodeById(msg.nodeId);
    if (!node) {
      figma.ui.postMessage({ type: "export-error", error: "Layer not found — try reselecting the layer" });
      return;
    }

    // VECTOR / BOOLEAN_OPERATION: read paths directly — no exportAsync needed.
    if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") {
      const svg = vectorNodeToSvg(node);
      if (svg) {
        figma.ui.postMessage({ type: "export-done", svg, name: node.name });
      } else {
        figma.ui.postMessage({ type: "export-error", error: "No path data found. Try flattening the layer (Ctrl+E) and selecting it again." });
      }
      return;
    }

    // FRAME / GROUP / COMPONENT / INSTANCE: use exportAsync.
    // Note: exportAsync can block the sandbox event loop on some setups;
    // the UI has its own 20s fallback timer that will surface an error.
    try {
      const bytes = await node.exportAsync({ format: "SVG" });

      let svg;
      try {
        svg = new TextDecoder().decode(bytes);
      } catch (_) {
        let s = "";
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        svg = s;
      }

      figma.ui.postMessage({ type: "export-done", svg, name: node.name });
    } catch (err) {
      figma.ui.postMessage({ type: "export-error", error: String(err) });
    }
    return;
  }

  // ── Insert an icon from the library onto the canvas ──────────────────────
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
