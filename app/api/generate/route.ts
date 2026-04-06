/**
 * Generate code and write to oncell cell.
 *
 * 1. Call LLM (OpenRouter) to generate code
 * 2. Write generated code to cell as index.html (via oncell API)
 * 3. Return the code + cell info
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
  const res = await fetch(`${ONCELL_API}/api/v1/agents/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ONCELL_KEY}`,
      "Content-Type": "application/json",
      "X-Customer-ID": customerId,
    },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function POST(req: Request) {
  const { instruction, projectId } = await req.json();

  if (!instruction) {
    return Response.json({ error: "instruction required" }, { status: 400 });
  }

  const customerId = projectId || `demo-${Date.now().toString(36)}`;

  // Read current code from cell (if exists)
  let currentCode: string | null = null;
  try {
    const readRes = await oncellRequest(customerId, "read_file", { path: "index.html" });
    if (readRes.content) currentCode = readRes.content;
  } catch {}

  // Read conversation history from cell DB
  let history: any[] = [];
  try {
    const dbRes = await oncellRequest(customerId, "db_get", { key: "conversation" });
    if (dbRes.value) history = dbRes.value;
  } catch {}

  // Build LLM messages
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const msg of history.slice(-4)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  if (currentCode) {
    messages.push({
      role: "user",
      content: `Here is the current HTML page:\n\n${currentCode}\n\nApply this change: ${instruction}`,
    });
  } else {
    messages.push({
      role: "user",
      content: `Generate a complete HTML page for: ${instruction}`,
    });
  }

  // Call LLM
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.2,
  });

  let code = response.choices[0]?.message?.content || "";
  code = code.replace(/^```(?:html?)?\n?/gm, "").replace(/```$/gm, "").trim();

  // Write to cell
  await oncellRequest(customerId, "write_file", { path: "index.html", content: code });

  // Save conversation
  history.push({ role: "user", content: instruction });
  history.push({ role: "assistant", content: code });
  await oncellRequest(customerId, "db_set", { key: "conversation", value: history });

  // Get file list
  const filesRes = await oncellRequest(customerId, "list_files", {});

  return Response.json({
    code,
    files: filesRes.files || [],
    edits: Math.floor(history.length / 2),
  });
}
