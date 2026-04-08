# Building a Coding Agent in 200 Lines of Code

*Part 1 of "From Zero to Agent" — a series on building real AI agents with [oncell.ai](https://oncell.ai)*

---

Every AI app I've built eventually hits the same wall: per-user compute.

You need to give each user their own storage, their own database, some way to run code in isolation. You start with S3 buckets and DynamoDB tables, then you need sandboxing, then preview URLs, then you're managing containers, and suddenly half your codebase is infrastructure glue.

I built [oncell.ai](https://oncell.ai) to make this go away. Each user gets an isolated "cell" — storage, database, vector search, shell access, and a live URL — and your agent code runs inside it. No Docker, no infra config, no storage setup.

To prove it actually works, I built a demo: a coding agent that generates web pages from natural language. The whole thing is ~200 lines. I built it in a week.

Here's the demo: [youtube.com/watch?v=rsz4EiO27-A](https://www.youtube.com/watch?v=rsz4EiO27-A)

And the repo: [github.com/oncellai/oncell-demo-agent](https://github.com/oncellai/oncell-demo-agent)

## The Problem (Again)

Say you're building a coding assistant, a design tool, or anything where users create artifacts. You need:

- **Isolated storage** per user (you can't have User A reading User B's files)
- **A database** for conversation history, metadata
- **A way to run code** that isn't your production server
- **A preview URL** so users can see what they built
- **Auto-scaling** so you're not paying for idle containers

Building this from scratch is easily a month of work. And it's not the interesting part — the interesting part is the agent.

## The Architecture

The demo is a Next.js app deployed on Vercel. It talks to oncell via 3 API calls. That's it.

```
POST /api/v1/cells           -> create cell with agent code
POST /api/v1/agents/generate -> send instruction to agent (streams back)
GET  {cell-id}.cells.oncell.ai -> live preview
```

The key insight: **the agent code runs inside the cell**, not on your server. When a user sends "build me a landing page," the instruction goes to the cell, the agent runs there, calls the LLM, writes files to local storage (0ms — it's local), and streams the result back.

```
Your app (Vercel)                  oncell (AWS)
+-------------------+             +------------------------------+
|                   |  create     |                              |
|  "New Project" ------cell----->   Cell created with agent code |
|                   |             |                              |
|  User types ------instruction->   Agent runs inside cell:      |
|  instruction      |             |    1. ctx.search (local 0ms) |
|                   |  SSE stream |    2. Call LLM (streaming)   |
|  Code appears <----streaming----    3. ctx.stream({ text })    |
|  char by char     |             |    4. ctx.store.write (0ms)  |
|                   |             |                              |
|  Preview iframe ----GET-------->   {cell-id}.cells.oncell.ai   |
+-------------------+             +------------------------------+
```

## The Agent Code

Here's the actual agent that runs inside each cell. This is the entire thing:

```javascript
module.exports = {
  async generate(ctx, params) {
    const instruction = params.instruction;

    // Read existing code if this is a follow-up edit
    let currentCode = null;
    if (ctx.store.exists("index.html")) {
      currentCode = ctx.store.read("index.html");
    }

    // Search existing code for relevant sections
    let codeContext = "";
    if (currentCode) {
      const results = ctx.search.query(instruction);
      if (results.length > 0) {
        codeContext = "\n\nRelevant existing code:\n" +
          results.slice(0, 3).map(r => r.content).join("\n");
      }
    }

    // Load conversation history from cell DB
    const history = ctx.db.get("conversation") || [];

    // Build LLM messages with context
    const messages = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const msg of history.slice(-4)) {
      messages.push({ role: msg.role, content: msg.content });
    }

    if (currentCode) {
      messages.push({
        role: "user",
        content: "Current HTML:\n\n" + currentCode + codeContext +
                 "\n\nApply: " + instruction
      });
    } else {
      messages.push({
        role: "user",
        content: "Generate a complete HTML page for: " + instruction
      });
    }

    // Stream LLM response back to browser
    ctx.stream({ status: "calling_llm", model: MODEL });
    const code = await callLLM(messages, (text) => ctx.stream({ text }));

    // Write to cell storage — 0ms, it's local
    ctx.store.write("index.html", code);

    // Persist conversation
    history.push({ role: "user", content: instruction });
    history.push({ role: "assistant", content: code });
    ctx.db.set("conversation", history);

    return { code, files: ctx.store.list() };
  },
};
```

Notice what's *not* here: no S3 calls, no database connections, no container orchestration, no URL routing. The `ctx` object gives you everything:

- **`ctx.store`** — filesystem (read/write files, 0ms local)
- **`ctx.db`** — key-value database (conversation history, metadata)
- **`ctx.search`** — vector text search (find relevant code snippets)
- **`ctx.stream`** — SSE streaming back to the browser
- **`ctx.journal`** — durable execution log
- **`ctx.shell`** — subprocess execution

All of these run locally inside the cell. No network roundtrips for file writes or DB operations.

## Creating a Cell

On the server side, creating a cell is one SDK call:

```typescript
import { OnCell } from "@oncell/sdk";

const oncell = new OnCell({
  apiKey: process.env.ONCELL_API_KEY,
  baseUrl: process.env.ONCELL_API_URL,
});

const cell = await oncell.cells.create({
  customerId: projectId,
  tier: "starter",
  agent: AGENT_CODE,
  secrets: {
    OPENROUTER_KEY: process.env.OPENROUTER_API_KEY,
    MODEL: process.env.MODEL || "google/gemini-2.5-flash",
  },
});

// cell.id -> use for agent requests
// cell.previewUrl -> {cell-id}.cells.oncell.ai
```

The agent code is passed as a string. Secrets are injected as environment variables inside the cell — they never touch the client.

## Sending Instructions

When the user types something, your server forwards it to the cell's agent:

```typescript
const res = await oncell.cells.agentRequest(projectId, "generate", {
  instruction: "add a dark mode toggle to the navbar"
});

// res is a streaming Response — forward it to the browser
return new Response(res.body, {
  headers: { "Content-Type": "text/event-stream" },
});
```

The agent inside the cell handles everything: loads context, calls the LLM, writes files, streams back. Your server is just a proxy.

## What Cells Handle For You

The demo developer wrote ~200 lines. Oncell handles:

| You get | How |
|---|---|
| Per-user isolation | Each cell is gVisor-sandboxed with its own storage and DB |
| Persistent storage | Files survive across sessions via `ctx.store` |
| Database | KV store via `ctx.db` — no setup |
| Vector search | `ctx.search.query()` over stored files |
| Live preview URL | `{cell-id}.cells.oncell.ai` — served from the cell |
| Auto-pause | Idle cells pause after 15 min, resume in 200ms from NVMe cache |
| Scaling | Cells scheduled across hosts automatically |

## Try It

```bash
git clone https://github.com/oncellai/oncell-demo-agent.git
cd oncell-demo-agent
npm install
```

You need two API keys:

- **ONCELL_API_KEY** from [oncell.ai](https://oncell.ai)
- **OPENROUTER_API_KEY** from [openrouter.ai](https://openrouter.ai)

Drop them in `.env.local`, run `npm run dev`, and you've got a coding agent with per-user isolated compute.

The whole demo works with any OpenRouter model — Gemini Flash for speed, Claude or GPT-4o for quality.

## Next Up

This post covered the "what" and "how" of the demo agent. In Part 2, I'll go deeper into the agent code itself: how conversation context works, how vector search finds the right code snippets to send to the LLM, and how to handle multi-file projects. We'll also look at what happens when cells auto-pause and resume — and why 200ms wake time matters for UX.

If you're building anything where users need their own compute — coding tools, design apps, data pipelines, sandboxed AI assistants — take a look at [oncell.ai](https://oncell.ai).

---

[Demo video](https://www.youtube.com/watch?v=rsz4EiO27-A) | [GitHub](https://github.com/oncellai/oncell-demo-agent) | [oncell.ai](https://oncell.ai)
