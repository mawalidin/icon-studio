const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { prompt, style, stroke, corners, count } = await req.json();

    const cornerRules =
      corners === "rounded"
        ? 'stroke-linecap="round", stroke-linejoin="round"; rounded rectangles use a ~2px corner radius.'
        : 'stroke-linecap="square", stroke-linejoin="miter"; rectangles have sharp 0px corners.';

    const styleRules: Record<string, string> = {
      line: `LINE style — fill="none", stroke="currentColor", stroke-width="${stroke}". Every path shares the EXACT same stroke-width. The icon is described purely by outlines.`,
      filled: `FILLED style — fill="currentColor", no stroke. A solid silhouette. Cut interior negative space using fill-rule="evenodd" on a single path rather than overlapping shapes. Keep the same optical proportions a line version would have.`,
      duotone: `DUOTONE style (Phosphor-style) — TWO layers: (1) a base silhouette using fill="currentColor" with opacity="0.2", then (2) the key outlines/details on top using fill="none" stroke="currentColor" stroke-width="${stroke}" at full opacity. The base provides mass, the strokes provide definition.`,
    };

    // §7 — tuned generation system prompt, preserved verbatim
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
10. ${styleRules[style] ?? ""}

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

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY secret not set on this function." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system,
        messages: [
          { role: "user", content: `Generate ${count} distinct icon variations representing: "${String(prompt).trim()}"` },
        ],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data.error?.message ?? "Anthropic API error" }),
        { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const text = ((data.content ?? []) as { type: string; text: string }[])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    let icons: unknown[] = [];
    try {
      icons = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      const matches = text.match(/<svg[\s\S]*?<\/svg>/gi);
      icons = matches ?? [];
    }

    return new Response(
      JSON.stringify({ icons }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
