/**
 * React App Generator Agent
 *
 * Generates multi-file React apps using the nextjs cell image.
 * Creates pages, components, and layouts with Tailwind CSS.
 * Uses the ---FILE/---ENDFILE streaming format for real-time file operations.
 *
 * Cell image: nextjs (pre-built Next.js 15 + Tailwind)
 * Output: Multiple files (app/page.tsx, app/components/*.tsx, etc.)
 *
 * Usage:
 *   const cell = await oncell.cells.create({
 *     customerId: "project-1",
 *     image: "nextjs",
 *     secrets: { OPENROUTER_KEY: "sk-or-..." },
 *   });
 *   await oncell.cells.agentRequest("project-1", "generate", { instruction: "Build a dashboard" });
 */

export const AGENT_CODE = `
const SYSTEM_PROMPT = \`You are an expert Next.js developer. Generate production-quality React components.

RULES:
- Every file must start with "use client"; on line 1
- Use Tailwind CSS for all styling
- Do NOT import React — hooks are auto-available
- Use lucide-react for icons: import { IconName } from "lucide-react"
- export default function ComponentName() at the end
- Make it visually polished, responsive, modern

RESPONSE FORMAT:
1. Brief commentary (2-3 sentences)
2. Files using delimiters:

---FILE app/page.tsx---
"use client";
// full code here
---ENDFILE---

---FILE app/components/Header.tsx---
"use client";
// full code here
---ENDFILE---

3. One-line summary: "Summary: ..."
\`;

module.exports = {
  async generate(ctx, params) {
    const instruction = params.instruction;
    if (!instruction) return { error: "instruction required" };

    const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
    const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
    if (!OPENROUTER_KEY) return { error: "OPENROUTER_KEY not configured" };

    ctx.journal.step("start", "Generating React app: " + instruction);

    // Gather existing files for context
    const files = ctx.store.list("app");
    let codeContext = "";
    for (const f of files.slice(0, 10)) {
      const content = ctx.store.read(f);
      if (content && content.length < 5000) {
        codeContext += "\\n--- " + f + " ---\\n" + content + "\\n";
      }
    }

    const history = ctx.db.get("conversation") || [];
    const messages = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const msg of history.slice(-4)) {
      messages.push(msg);
    }
    let userMsg = instruction;
    if (codeContext) {
      userMsg = "Current project files:\\n" + codeContext + "\\n\\nInstruction: " + instruction;
    }
    messages.push({ role: "user", content: userMsg });

    ctx.stream({ status: "calling_llm", model: MODEL });

    // Stream from LLM
    const https = require("https");
    const fullResponse = await new Promise((resolve, reject) => {
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
              const text = parsed.choices?.[0]?.delta?.content;
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

    // Parse ---FILE path--- / ---ENDFILE--- blocks
    const fileRegex = /---FILE\\s+(.+?)---([\\s\\S]*?)---ENDFILE---/g;
    let match;
    const writtenFiles = [];

    while ((match = fileRegex.exec(fullResponse)) !== null) {
      const path = match[1].trim();
      const content = match[2].trim();
      if (path && content) {
        ctx.store.write(path, content);
        writtenFiles.push(path);
        ctx.stream({ event: "file-written", path, lines: content.split("\\n").length });
        ctx.journal.step("write", "Wrote " + path, { lines: content.split("\\n").length });
      }
    }

    // Save conversation
    history.push({ role: "user", content: instruction });
    history.push({ role: "assistant", content: fullResponse.split("---FILE")[0].trim() || "Generated code" });
    ctx.db.set("conversation", history);

    ctx.journal.step("done", "Generated " + writtenFiles.length + " files");
    return { files: writtenFiles, count: writtenFiles.length };
  },
};
`;

export const config = {
  name: "React App Generator",
  description: "Generates multi-file Next.js/React apps with components and routing",
  image: "nextjs",
  tier: "starter",
};
