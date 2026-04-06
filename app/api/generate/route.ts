/**
 * Generate code via LLM (streaming), write to oncell cell, return cell ID for preview.
 */

import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
const ONCELL_API = process.env.ONCELL_API_URL || "https://api.oncell.ai";
const ONCELL_KEY = process.env.ONCELL_API_KEY || "";

const SYSTEM_PROMPT = `You are an expert web developer. Generate a COMPLETE, SINGLE HTML page with embedded CSS and JavaScript.

Rules:
- Output ONLY valid HTML — no markdown fences, no explanation
- Include <script src="https://cdn.tailwindcss.com"></script> in the head
- Use Tailwind CSS for all styling
- Include any JavaScript inline in <script> tags
- Make it visually polished — proper spacing, colors, typography, responsive
- The page must be completely self-contained (no external dependencies except Tailwind CDN)
- When modifying existing code, preserve the overall structure and only change what was requested`;

async function oncellRequest(customerId: string, method: string, params: Record<string, any>) {
  return fetch(`${ONCELL_API}/api/v1/agents/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ONCELL_KEY}`,
      "Content-Type": "application/json",
      "X-Customer-ID": customerId,
    },
    body: JSON.stringify(params),
  }).then(r => r.json());
}

export async function POST(req: Request) {
  const { instruction, projectId } = await req.json();

  if (!instruction) {
    return Response.json({ error: "instruction required" }, { status: 400 });
  }

  const customerId = projectId || `demo-${Date.now().toString(36)}`;

  // Read current code from cell
  let currentCode: string | null = null;
  try {
    const r = await oncellRequest(customerId, "read_file", { path: "index.html" });
    if (r.content) currentCode = r.content;
  } catch {}

  // Read conversation history
  let history: any[] = [];
  try {
    const r = await oncellRequest(customerId, "db_get", { key: "conversation" });
    if (r.value) history = r.value;
  } catch {}

  // Build LLM messages
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  for (const msg of history.slice(-4)) {
    messages.push({ role: msg.role, content: msg.content });
  }
  if (currentCode) {
    messages.push({ role: "user", content: `Current HTML:\n\n${currentCode}\n\nApply: ${instruction}` });
  } else {
    messages.push({ role: "user", content: `Generate a complete HTML page for: ${instruction}` });
  }

  // Get the cell ID (from oncell API — creating the cell triggers this)
  let cellId = "";
  try {
    const cells = await fetch(`${ONCELL_API}/api/v1/cells`, {
      headers: { Authorization: `Bearer ${ONCELL_KEY}` },
    }).then(r => r.json());
    const cell = cells.cells?.find((c: any) => c.customer_id === customerId);
    cellId = cell?.cell_id || "";
  } catch {}

  // Stream LLM response
  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
    temperature: 0.2,
  });

  const encoder = new TextEncoder();
  let fullCode = "";

  const readable = new ReadableStream({
    async start(controller) {
      // Send cell ID first so frontend can set preview URL immediately
      if (cellId) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ cellId })}\n\n`));
      }

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          fullCode += text;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
      }

      // Clean up
      fullCode = fullCode.replace(/^```(?:html?)?\n?/gm, "").replace(/```$/gm, "").trim();

      // Write to cell + save conversation (fire and forget)
      oncellRequest(customerId, "write_file", { path: "index.html", content: fullCode }).catch(() => {});

      history.push({ role: "user", content: instruction });
      history.push({ role: "assistant", content: fullCode });
      oncellRequest(customerId, "db_set", { key: "conversation", value: history }).catch(() => {});

      // Get files
      const filesRes = await oncellRequest(customerId, "list_files", {}).catch(() => ({ files: [] }));

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        done: true,
        cellId,
        files: filesRes.files || [],
        edits: Math.floor(history.length / 2),
      })}\n\n`));

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
