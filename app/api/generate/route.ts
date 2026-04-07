/**
 * Send a request to the agent inside the oncell cell.
 * Uses @oncell/sdk. Forwards the response (JSON or SSE stream).
 */

import { OnCell } from "@oncell/sdk";

const oncell = new OnCell({
  apiKey: process.env.ONCELL_API_KEY,
  baseUrl: process.env.ONCELL_API_URL,
});

export async function POST(req: Request) {
  const { instruction, projectId } = await req.json();

  if (!instruction || !projectId) {
    return Response.json({ error: "instruction and projectId required" }, { status: 400 });
  }

  try {
    const res = await oncell.cells.agentRequest(projectId, "generate", { instruction });

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: any) {
    console.error("generate error:", err.message);
    return Response.json({ error: err.message || "Agent request failed" }, { status: 502 });
  }
}
