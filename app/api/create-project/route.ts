/**
 * Create a new project — provisions an oncell cell with an agent that generates web pages.
 * The agent code runs INSIDE the cell with direct local access to storage, DB, search.
 */

const ONCELL_API = process.env.ONCELL_API_URL || "https://api.oncell.ai";
const ONCELL_KEY = process.env.ONCELL_API_KEY || "";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.MODEL || "google/gemini-2.5-flash";

// Agent code that runs inside the cell
const AGENT_CODE = `
const OPENROUTER_KEY = "${OPENROUTER_KEY}";
const MODEL = "${MODEL}";

const SYSTEM_PROMPT = "You are an expert web developer. Generate a COMPLETE, SINGLE HTML page with embedded CSS and JavaScript. Rules: Output ONLY valid HTML — no markdown fences, no explanation. Include <script src=\\"https://cdn.tailwindcss.com\\"></script> in the head. Use Tailwind CSS for all styling. Include any JavaScript inline in <script> tags. Make it visually polished — proper spacing, colors, typography, responsive. The page must be self-contained. When modifying existing code, preserve structure and only change what was requested.";

module.exports = {
  async generate(ctx, params) {
    const instruction = params.instruction;
    if (!instruction) return { error: "instruction required" };

    ctx.journal.step("start", "Generating: " + instruction);

    // Load existing code (local NVMe — 0ms)
    let currentCode = null;
    if (ctx.store.exists("index.html")) {
      currentCode = ctx.store.read("index.html");
    }

    // Search existing code for context (local — 0ms)
    let codeContext = "";
    if (currentCode) {
      const results = ctx.search.query(instruction);
      if (results.length > 0) {
        codeContext = "\\n\\nRelevant existing code:\\n" + results.slice(0, 3).map(r => r.content).join("\\n");
      }
    }

    // Load conversation history (local DB — 0ms)
    const history = ctx.db.get("conversation") || [];

    // Build LLM messages
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

    // Stream LLM via native https module (reliable in Node.js)
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
              if (text) {
                result += text;
                ctx.stream({ text });
              }
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

    code = code.replace(/^\`\`\`(?:html?)?\\n?/gm, "").replace(/\`\`\`$/gm, "").trim();

    ctx.stream({ status: "writing", lines: code.split("\\n").length });

    const lines = code.split("\\n").length;
    ctx.journal.step("write", "Writing index.html", { lines });

    // Write to cell storage (local NVMe — 0ms)
    ctx.store.write("index.html", code);

    // Save conversation (local DB — 0ms)
    history.push({ role: "user", content: instruction });
    history.push({ role: "assistant", content: code });
    ctx.db.set("conversation", history);

    // Update metadata
    const meta = ctx.db.get("project") || { edits: 0 };
    meta.edits = (meta.edits || 0) + 1;
    meta.lastEdit = new Date().toISOString();
    ctx.db.set("project", meta);

    ctx.journal.step("done", "Generation complete");

    return { code, files: ctx.store.list(), edits: meta.edits };
  },

  status(ctx) {
    const code = ctx.store.exists("index.html") ? ctx.store.read("index.html") : null;
    const history = ctx.db.get("conversation") || [];
    const meta = ctx.db.get("project") || null;
    return { code, history, meta, files: ctx.store.list() };
  },
};
`;

export async function POST(req: Request) {
  const { projectId } = await req.json();

  if (!projectId) {
    return Response.json({ error: "projectId required" }, { status: 400 });
  }

  const res = await fetch(`${ONCELL_API}/api/v1/cells`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ONCELL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer_id: projectId,
      tier: "starter",
      agent: AGENT_CODE,
    }),
  });

  const cell = await res.json();

  return Response.json({
    cellId: cell.cell_id,
    status: cell.status,
    previewUrl: cell.preview_url || (cell.cell_id ? `https://${cell.cell_id}.cells.oncell.ai` : null),
  });
}
