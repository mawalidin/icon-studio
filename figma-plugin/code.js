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

figma.ui.onmessage = async (msg) => {

  // ── Export a Figma layer as SVG ──────────────────────────────────────────
  if (msg.type === "export-frame") {
    const node = figma.getNodeById(msg.nodeId);
    if (!node) {
      figma.ui.postMessage({ type: "export-error", error: "Layer not found" });
      return;
    }
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Export timed out — try a simpler layer")), 12000)
      );
      const bytes = await Promise.race([
        node.exportAsync({ format: "SVG" }),
        timeout,
      ]);
      // Pass raw bytes as a plain array — TextDecoder is unavailable in the
      // Figma sandbox; decoding happens in the UI iframe instead.
      figma.ui.postMessage({
        type: "export-done",
        bytes: Array.from(bytes),
        name: node.name,
      });
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
