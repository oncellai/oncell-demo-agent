/**
 * Proxy to oncell API — hides the API key from the client.
 * POST /api/generate { instruction, projectId }
 *   → POST api.oncell.ai/api/v1/agents/generate
 */

const ONCELL_API = process.env.ONCELL_API_URL || "https://api.oncell.ai";
const ONCELL_KEY = process.env.ONCELL_API_KEY || "";

export async function POST(req: Request) {
  const { instruction, projectId } = await req.json();

  if (!instruction) {
    return Response.json({ error: "instruction required" }, { status: 400 });
  }

  const res = await fetch(`${ONCELL_API}/api/v1/agents/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ONCELL_KEY}`,
      "Content-Type": "application/json",
      "X-Customer-ID": projectId || `project-${Date.now().toString(36)}`,
    },
    body: JSON.stringify({ instruction }),
  });

  // Forward response (may be JSON or SSE stream)
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
