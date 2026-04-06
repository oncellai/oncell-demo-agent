/**
 * OnCell Demo Coding Agent
 *
 * Runs inside each cell. Generates Next.js apps from natural language.
 * Uses cell primitives: store (files), db (conversation), search (code context).
 *
 * Endpoints:
 *   setup     — scaffold Next.js project + start dev server
 *   generate  — receive instruction, generate/edit code via LLM
 *   status    — return project info (files, conversation, preview URL)
 */

import { Agent, Cell } from "oncell";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

const MODEL = process.env.MODEL || "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `You are an expert Next.js developer. You generate complete, working React components using TypeScript and Tailwind CSS.

Rules:
- Output ONLY valid TSX code — no markdown fences, no explanation
- Use "use client" directive when the component needs interactivity
- Use Tailwind CSS for all styling
- Make it visually polished with proper spacing, colors, typography, responsive design
- Include all necessary imports at the top
- Export default the main component
- The component must be self-contained — no local imports
- Use modern React patterns (hooks, conditional rendering)
- When modifying existing code, preserve structure and only change what was requested`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

class DemoCodingAgent extends Agent {
  static cell = { compute: "2cpu-4gb", storage: "10gb" };

  /**
   * Called once when the cell is first created.
   * Scaffolds a minimal Next.js project so `next dev` can serve it.
   */
  async setup(ctx: Cell) {
    // Scaffold Next.js project
    await ctx.store.write("package.json", JSON.stringify({
      name: "oncell-preview",
      private: true,
      scripts: { dev: "next dev --port 8081" },
      dependencies: { next: "latest", react: "latest", "react-dom": "latest" },
    }, null, 2));

    await ctx.store.write("next.config.ts", "export default {};");
    await ctx.store.write("tsconfig.json", JSON.stringify({
      compilerOptions: { target: "es5", lib: ["dom", "es2017"], jsx: "preserve", moduleResolution: "bundler", esModuleInterop: true, strict: false },
      include: ["**/*.ts", "**/*.tsx"],
    }, null, 2));

    await ctx.store.write("app/layout.tsx", `export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><script src="https://cdn.tailwindcss.com"></script></head>
      <body>{children}</body>
    </html>
  );
}`);

    await ctx.store.write("app/page.tsx", `export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-gray-400 text-lg">Waiting for first instruction...</p>
    </div>
  );
}`);

    // Install deps + start dev server in background
    await ctx.shell("cd /cells/" + ctx.id + "/work && npm install --quiet 2>&1");
    await ctx.shell("cd /cells/" + ctx.id + "/work && npx next dev --port 8081 &", { durable: false });

    await ctx.db.set("project", { created: new Date().toISOString(), edits: 0 });
  }

  /**
   * Generate or edit code based on instruction.
   */
  async generate(ctx: Cell, instruction: string) {
    // Load conversation history
    const history: ChatMessage[] = (await ctx.db.get("conversation")) || [];

    // Load current code
    const currentCode = await ctx.store.exists("app/page.tsx")
      ? await ctx.store.read("app/page.tsx")
      : null;

    // Search existing code for context
    let codeContext = "";
    if (currentCode) {
      const results = await ctx.search.query(instruction);
      if (results.length > 0) {
        codeContext = "\n\nRelevant existing code:\n" +
          results.slice(0, 3).map((r: any) => `--- ${r.path} ---\n${r.content}`).join("\n\n");
      }
    }

    // Build LLM messages
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    for (const msg of history.slice(-4)) {
      messages.push({ role: msg.role as any, content: msg.content });
    }

    if (currentCode) {
      messages.push({
        role: "user",
        content: `Current code:\n\n${currentCode}${codeContext}\n\nApply this change: ${instruction}`,
      });
    } else {
      messages.push({
        role: "user",
        content: `Generate a Next.js page component for: ${instruction}`,
      });
    }

    // Call LLM
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.2,
    });

    let generatedCode = response.choices[0]?.message?.content || "";

    // Clean markdown fences
    generatedCode = generatedCode
      .replace(/^```(?:tsx?|jsx?|typescript|javascript)?\n?/gm, "")
      .replace(/```$/gm, "")
      .trim();

    // Write to cell store
    await ctx.store.write("app/page.tsx", generatedCode);

    // Index for future search
    await ctx.search.index(ctx.workDir);

    // Save conversation
    history.push({ role: "user", content: instruction });
    history.push({ role: "assistant", content: generatedCode });
    await ctx.db.set("conversation", history);

    // Update metadata
    const meta = (await ctx.db.get("project")) || { edits: 0 };
    meta.edits = (meta.edits || 0) + 1;
    meta.lastEdit = new Date().toISOString();
    meta.lastInstruction = instruction;
    await ctx.db.set("project", meta);

    return {
      code: generatedCode,
      edits: meta.edits,
      files: await ctx.store.list(),
    };
  }

  /**
   * Return project status.
   */
  async status(ctx: Cell) {
    const code = await ctx.store.exists("app/page.tsx")
      ? await ctx.store.read("app/page.tsx")
      : null;
    const history = (await ctx.db.get("conversation")) || [];
    const meta = (await ctx.db.get("project")) || null;
    const files = await ctx.store.list();

    return { code, history, meta, files };
  }
}

export default DemoCodingAgent;
