const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { svg, hint } = await req.json();

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY secret not set on this function." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const hintLine = hint ? `\nHint (what the designer searched for): "${hint}"` : "";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: `You are tagging an SVG icon for a hospitality design library. Given the icon below, produce a short human-readable name (2–4 words, title case) and 3–6 lowercase descriptive search tags that a designer might type to find it.${hintLine}

SVG: ${String(svg).slice(0, 2000)}

Respond with ONLY a valid JSON object and nothing else:
{"name": "Room Service Tray", "tags": ["tray", "food", "service", "hospitality", "room service"]}`,
          },
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
      .join("")
      .trim();

    let result = { name: "", tags: [] as string[] };
    try {
      result = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      // Return empty result; caller handles gracefully
    }

    return new Response(
      JSON.stringify(result),
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
