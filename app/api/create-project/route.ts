/**
 * Create a new project — provisions an oncell cell with a coding agent.
 * Uses @oncell/sdk. Agent code runs INSIDE the cell. Secrets injected as env vars.
 */

import { OnCell } from "@oncell/sdk";

const oncell = new OnCell({
  apiKey: process.env.ONCELL_API_KEY,
  baseUrl: process.env.ONCELL_API_URL,
});

const AGENT_CODE = `
const SYSTEM_PROMPT = "You are an expert web developer. Generate a COMPLETE, SINGLE HTML page with embedded CSS and JavaScript. Rules: Output ONLY valid HTML — no markdown fences, no explanation. Include <script src=\\"https://cdn.tailwindcss.com\\"></script> in the head. Use Tailwind CSS for all styling. Include any JavaScript inline in <script> tags. Make it visually polished — proper spacing, colors, typography, responsive. The page must be self-contained. When modifying existing code, preserve structure and only change what was requested.";

module.exports = {
  async generate(ctx, params) {
    const instruction = params.instruction;
    if (!instruction) return { error: "instruction required" };

    const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
    const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
    if (!OPENROUTER_KEY) return { error: "OPENROUTER_KEY not configured" };

    ctx.journal.step("start", "Generating: " + instruction);

    let currentCode = null;
    if (ctx.store.exists("index.html")) {
      currentCode = ctx.store.read("index.html");
    }

    let codeContext = "";
    if (currentCode) {
      const results = ctx.search.query(instruction);
      if (results.length > 0) {
        codeContext = "\\n\\nRelevant existing code:\\n" + results.slice(0, 3).map(r => r.content).join("\\n");
      }
    }

    const history = ctx.db.get("conversation") || [];
    const messages = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const msg of history.slice(-4)) {
      messages.push({ role: msg.role, content: msg.content });
    }
    if (currentCode) {
      messages.push({ role: "user", content: "Current HTML:\\n\\n" + currentCode + codeContext + "\\n\\nApply: " + instruction });
    } else {
      messages.push({ role: "user", content: "Generate a complete HTML page for: " + instruction });
    }

    ctx.journal.step("llm", "Calling " + MODEL);
    ctx.stream({ status: "calling_llm", model: MODEL });

    const https = require("https");
    let code = await new Promise((resolve, reject) => {
      let result = "";
      let buf = "";
      const payload = JSON.stringify({ model: MODEL, messages, temperature: 0.2, stream: true });
      const req = https.request({
        hostname: "openrouter.ai",
        path: "/api/v1/chat/completions",
        method: "POST",
        headers: {
          "Authorization": "Bearer " + OPENROUTER_KEY,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      }, (res) => {
        res.on("data", (chunk) => {
          buf += chunk.toString();
          const lines = buf.split("\\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ") || line.trim() === "data: [DONE]") continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              const text = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
              if (text) { result += text; ctx.stream({ text }); }
            } catch {}
          }
        });
        res.on("end", () => resolve(result));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    code = code.replace(/^\\\`\\\`\\\`(?:html?)?\\n?/gm, "").replace(/\\\`\\\`\\\`$/gm, "").trim();
    ctx.stream({ status: "writing", lines: code.split("\\n").length });

    ctx.journal.step("write", "Writing index.html", { lines: code.split("\\n").length });
    ctx.store.write("index.html", code);

    history.push({ role: "user", content: instruction });
    history.push({ role: "assistant", content: code });
    ctx.db.set("conversation", history);

    const meta = ctx.db.get("project") || { edits: 0 };
    meta.edits = (meta.edits || 0) + 1;
    meta.lastEdit = new Date().toISOString();
    ctx.db.set("project", meta);

    ctx.journal.step("done", "Generation complete");
    return { code, files: ctx.store.list(), edits: meta.edits };
  },
};
`;

export async function POST(req: Request) {
  const { projectId } = await req.json();
  if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

  const cell = await oncell.cells.create({
    customerId: projectId,
    tier: "starter",
    agent: AGENT_CODE,
    secrets: {
      OPENROUTER_KEY: process.env.OPENROUTER_API_KEY || "",
      MODEL: process.env.MODEL || "google/gemini-2.5-flash",
    },
  });

  return Response.json({
    cellId: cell.id,
    status: cell.status,
    previewUrl: cell.previewUrl,
  });
}
