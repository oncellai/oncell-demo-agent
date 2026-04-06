# oncell-demo-agent

A coding agent built on [oncell.ai](https://oncell.ai) — generates web pages from natural language. Each project gets its own isolated cell with persistent storage, database, and a live preview URL.

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
│  New Project btn ──────Project"───▶  Cell created (own sandbox,    │
│                     │             │  storage, port, preview URL)   │
│                     │             │                                │
│  User types ────────│──┐          │                                │
│  instruction        │  ▼          │                                │
│                     │  LLM call   │                                │
│  API route calls ───│─(OpenRouter)│                                │
│  Gemini / Claude    │  │          │                                │
│                     │  ▼          │                                │
│  Writes code ───────│─────────────▶  write_file → cell storage     │
│  Saves convo ───────│─────────────▶  db_set → cell database        │
│                     │             │                                │
│  Preview iframe ────│─────────────▶  {cell-id}.cells.oncell.ai     │
│  loads from cell    │             │  serves index.html from cell   │
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

The entire demo uses 5 API calls:

```
POST /api/v1/cells                    → create a cell for a new project
POST /api/v1/agents/write_file        → write generated code to cell
POST /api/v1/agents/read_file         → read existing code for edits
POST /api/v1/agents/db_set            → save conversation history
POST /api/v1/agents/list_files        → list files in cell
GET  {cell-id}.cells.oncell.ai        → live preview (served by cell)
```

No Docker, no infra config, no storage setup. Just API calls.

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
