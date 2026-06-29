figma.showUI(__html__, { width: 320, height: 560, themeColors: true });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "insert-icon") {
    try {
      const node = figma.createNodeFromSvg(msg.svg);
      node.name = msg.name;

      // Center on current viewport
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

  if (msg.type === "close") {
    figma.closePlugin();
  }
};
