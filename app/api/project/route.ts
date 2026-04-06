/**
 * Proxy to oncell API — get project status.
 * GET /api/project?id=xxx
 *   → POST api.oncell.ai/api/v1/agents/status
 */

const ONCELL_API = process.env.ONCELL_API_URL || "https://api.oncell.ai";
const ONCELL_KEY = process.env.ONCELL_API_KEY || "";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("id");

  if (!projectId) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  const res = await fetch(`${ONCELL_API}/api/v1/agents/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ONCELL_KEY}`,
      "Content-Type": "application/json",
      "X-Customer-ID": projectId,
    },
  });

  const data = await res.json();
  return Response.json(data);
}
