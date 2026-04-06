import { generate } from "../../../lib/agent";

export async function POST(req: Request) {
  const { instruction, projectId } = await req.json();

  if (!instruction) {
    return Response.json({ error: "instruction required" }, { status: 400 });
  }

  const stream = await generate(projectId || "default", instruction);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
