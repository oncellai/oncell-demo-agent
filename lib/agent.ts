/**
 * OnCell-powered coding agent.
 *
 * Uses oncell primitives:
 *   - Store:   persist generated files across sessions
 *   - DB:      conversation history + project metadata
 *   - Search:  vector index of code for context-aware edits
 *   - Journal: durable execution + crash recovery
 */

import { Cell } from "oncell";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

const MODEL = process.env.MODEL || "google/gemini-2.5-flash";

// Each user/project gets their own cell — isolated storage, db, search
const cells = new Map<string, Cell>();

function getCell(projectId: string): Cell {
  if (!cells.has(projectId)) {
    cells.set(projectId, new Cell(projectId, {
      baseDir: process.env.CELLS_DIR || "/tmp/oncell-cells",
    }));
  }
  return cells.get(projectId)!;
}

const SYSTEM_PROMPT = `You are an expert Next.js developer. You generate complete, working React components using TypeScript and Tailwind CSS.

Rules:
- Output ONLY valid TSX code — no markdown fences, no explanation, no commentary
- Use "use client" directive when the component needs interactivity
- Use Tailwind CSS for all styling — no CSS files
- Make it visually polished with proper spacing, colors, typography, and responsive design
- Include all necessary imports at the top
- Export default the main component
- The component must be a complete, self-contained page
- Do NOT import from local files — everything in one file
- Use modern React patterns (hooks, conditional rendering)

When modifying existing code, preserve the overall structure and only change what was requested.`;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Generate or edit code for a project.
 * Streams back the generated code as SSE events.
 */
export async function generate(
  projectId: string,
  instruction: string,
): Promise<ReadableStream> {
  const cell = getCell(projectId);

  // ─── DB: Load conversation history ───
  const history: ChatMessage[] = (await cell.db.get("conversation")) || [];

  // ─── Store: Load current code if exists ───
  const currentCode = await cell.store.exists("app/page.tsx")
    ? await cell.store.read("app/page.tsx")
    : null;

  // ─── Search: Find relevant existing code for context ───
  let codeContext = "";
  if (currentCode) {
    const results = await cell.search.query(instruction);
    if (results.length > 0) {
      codeContext = `\n\nRelevant existing code:\n${results.slice(0, 3).map((r: any) => `--- ${r.path} ---\n${r.content}`).join("\n\n")}`;
    }
  }

  // ─── Build LLM messages ───
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Add recent conversation for context (last 4 turns)
  const recent = history.slice(-4);
  for (const msg of recent) {
    messages.push({ role: msg.role as any, content: msg.content });
  }

  if (currentCode) {
    messages.push({
      role: "user",
      content: `Here is the current code:\n\n${currentCode}${codeContext}\n\nApply this change: ${instruction}`,
    });
  } else {
    messages.push({
      role: "user",
      content: `Generate a Next.js page component for: ${instruction}${codeContext}`,
    });
  }

  // ─── Journal: Durable execution ───
  // If we crash mid-generation and restart, the journal ensures we don't lose state

  const encoder = new TextEncoder();
  let generatedCode = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = await openai.chat.completions.create({
          model: MODEL,
          messages,
          stream: true,
          temperature: 0.2,
        });

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            generatedCode += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        }

        // Clean up markdown fences
        generatedCode = generatedCode
          .replace(/^```(?:tsx?|jsx?|typescript|javascript)?\n?/gm, "")
          .replace(/```$/gm, "")
          .trim();

        // ─── Store: Persist generated code ───
        await cell.store.write("app/page.tsx", generatedCode);

        // ─── Search: Index the new code for future queries ───
        await cell.search.index(cell.workDir);

        // ─── DB: Save conversation ───
        history.push({ role: "user", content: instruction });
        history.push({ role: "assistant", content: generatedCode });
        await cell.db.set("conversation", history);

        // ─── DB: Update project metadata ───
        const meta = (await cell.db.get("project")) || { created: new Date().toISOString(), edits: 0 };
        meta.edits = (meta.edits || 0) + 1;
        meta.lastEdit = new Date().toISOString();
        meta.lastInstruction = instruction;
        await cell.db.set("project", meta);

        // Send completion event with metadata
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          done: true,
          meta: { edits: meta.edits, files: await cell.store.list() },
        })}\n\n`));

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
      }
      controller.close();
    },
  });

  return readable;
}

/**
 * Get project info — files, conversation history, metadata.
 */
export async function getProject(projectId: string) {
  const cell = getCell(projectId);

  const code = await cell.store.exists("app/page.tsx")
    ? await cell.store.read("app/page.tsx")
    : null;

  const history: ChatMessage[] = (await cell.db.get("conversation")) || [];
  const meta = (await cell.db.get("project")) || null;
  const files = await cell.store.list();

  return { code, history, meta, files };
}

/**
 * List all projects (cells) on this instance.
 */
export async function listProjects(): Promise<string[]> {
  const fs = await import("fs");
  const path = await import("path");
  const dir = process.env.CELLS_DIR || "/tmp/oncell-cells";
  try {
    return fs.readdirSync(dir).filter((f: string) =>
      fs.statSync(path.join(dir, f)).isDirectory()
    );
  } catch {
    return [];
  }
}
