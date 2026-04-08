# oncell-demo-agent

A coding agent built on [oncell.ai](https://oncell.ai) — generates web pages from natural language. Each project gets its own isolated cell with persistent storage, database, and a live preview URL.

## Demo

[![Watch the demo](https://img.youtube.com/vi/rsz4EiO27-A/maxresdefault.jpg)](https://www.youtube.com/watch?v=rsz4EiO27-A)

## How It Works

1. User clicks **"New Project"** → an oncell cell is created on AWS
2. Types an instruction → LLM generates HTML → writes to cell storage
3. Preview loads live at `{cell-id}.cells.oncell.ai`
4. Follow-up instructions edit the code with conversation context
5. Files, conversations, and preview persist across sessions

```
Demo app (Vercel)                    oncell platform (AWS)
┌─────────────────────┐             ┌────────────────────────────────┐
│                     │  "New       │                                │
│  New Project btn ──────Project"───▶  Cell created with agent code  │
│                     │             │                                │
│  User types ────────│─────────────▶  Agent runs inside cell:       │
│  instruction        │             │    1. Search code (local 0ms)  │
│                     │  streaming  │    2. Call LLM (streaming)     │
│  Code appears ◀─────│──SSE────────│    3. ctx.stream({ text })     │
│  character by       │             │    4. Write file (local 0ms)   │
│  character          │             │    5. Return final result      │
│                     │             │                                │
│  Preview iframe ────│─────────────▶  {cell-id}.cells.oncell.ai     │
└─────────────────────┘             └────────────────────────────────┘
```

## What OnCell Provides

The demo developer wrote ~200 lines. OnCell handles everything else:

| Feature | How |
|---|---|
| **Per-user isolation** | Each project = own cell with own storage, DB, and port |
| **Persistent storage** | Files survive across sessions (`write_file` / `read_file`) |
| **Database** | Conversation history persists (`db_set` / `db_get`) |
| **Live preview URL** | Every cell gets `{cell-id}.cells.oncell.ai` |
| **Security** | gVisor sandboxing, network isolation, encrypted storage |
| **Auto-pause** | Idle cells pause automatically, wake on next request (200ms) |
| **Scaling** | Cells scheduled across hosts, no server management |

## Quick Start

```bash
git clone https://github.com/oncellai/oncell-demo-agent.git
cd oncell-demo-agent
npm install
```

Create `.env.local`:

```
ONCELL_API_URL=https://api.oncell.ai
ONCELL_API_KEY=oncell_sk_your-key-here
OPENROUTER_API_KEY=sk-or-v1-your-key-here
MODEL=google/gemini-2.5-flash
NEXT_PUBLIC_CELLS_DOMAIN=cells.oncell.ai
```

- **ONCELL_API_KEY** — get from [oncell.ai/dashboard/keys](https://oncell.ai/dashboard/keys)
- **OPENROUTER_API_KEY** — get from [openrouter.ai](https://openrouter.ai)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/oncellai/oncell-demo-agent&env=ONCELL_API_KEY,ONCELL_API_URL,OPENROUTER_API_KEY,MODEL,NEXT_PUBLIC_CELLS_DOMAIN)

### Any Platform

```bash
npm run build && npm start
```

Set env vars: `ONCELL_API_KEY`, `ONCELL_API_URL`, `OPENROUTER_API_KEY`, `MODEL`, `NEXT_PUBLIC_CELLS_DOMAIN`.

## oncell API Calls Used

The entire demo uses 3 API calls:

```
POST /api/v1/cells                    → create cell with agent code
POST /api/v1/agents/generate          → send request to agent (streams back)
GET  {cell-id}.cells.oncell.ai        → live preview (served by cell)
```

No Docker, no infra config, no storage setup. The agent handles file writes, DB, and search locally inside the cell.

> **Note:** This demo uses the **default** cell image (bare Node.js runtime). Agent code is passed inline via the `agent` field. For pre-built environments like Next.js, you can specify `image: "nextjs"` when creating a cell — see the [Cell Images docs](https://oncell.ai/docs#cell-images).

## Supported Models

Any [OpenRouter](https://openrouter.ai/models) model:

| Model | Speed | Quality |
|---|---|---|
| `google/gemini-2.5-flash` | Fast | Good |
| `anthropic/claude-sonnet-4` | Medium | Great |
| `openai/gpt-4o` | Medium | Great |

## License

MIT

---

Built with [oncell.ai](https://oncell.ai) — per-customer isolated compute for AI agents.
