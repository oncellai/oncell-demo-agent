# oncell-demo-agent

A coding agent built on [oncell.ai](https://oncell.ai) — generates Next.js apps from natural language instructions.

Type what you want, get a working React component with a live preview. Every project gets its own isolated cell with persistent storage, database, and vector search.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Your App (this repo)                                       │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │  Chat UI │───▶│  API Route   │───▶│  LLM (OpenRouter) │  │
│  │  (React) │◀───│  /api/generate│◀───│  Gemini / Claude  │  │
│  └──────────┘    └──────┬───────┘    └───────────────────┘  │
│                         │                                   │
│                         ▼                                   │
│              ┌─────────────────────┐                        │
│              │    oncell Cell      │                        │
│              │  (per project)      │                        │
│              │                     │                        │
│              │  ┌───────────────┐  │                        │
│              │  │ Store         │  │  Persist generated     │
│              │  │ app/page.tsx  │  │  files across sessions │
│              │  └───────────────┘  │                        │
│              │  ┌───────────────┐  │                        │
│              │  │ Database      │  │  Conversation history  │
│              │  │ (SQLite)      │  │  + project metadata    │
│              │  └───────────────┘  │                        │
│              │  ┌───────────────┐  │                        │
│              │  │ Vector Search │  │  Index code for        │
│              │  │               │  │  context-aware edits   │
│              │  └───────────────┘  │                        │
│              │  ┌───────────────┐  │                        │
│              │  │ Journal       │  │  Crash recovery        │
│              │  │ (WAL)         │  │  + durable execution   │
│              │  └───────────────┘  │                        │
│              └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

**You write the agent logic. OnCell handles everything else.**

## What OnCell Takes Care Of

### Isolation

Every end-user gets their own cell — a gVisor-sandboxed environment. Cell A physically cannot see Cell B. No shared filesystems, no shared databases, no shared processes. Your users' data is isolated at the kernel level, not just by application logic.

### Storage & Persistence

Files, databases, and search indexes persist across sessions. When a user comes back tomorrow, their project is exactly where they left it. Data lives on NVMe SSDs co-located with compute — no network round-trips to read a file.

### Security

- **gVisor sandboxing** — each cell runs in its own kernel sandbox
- **Network isolation** — iptables per cell, egress blocked by default
- **Encrypted storage** — NVMe encrypted at rest, S3 snapshots encrypted with KMS
- **No shared infrastructure** — each customer's data is physically separate

### Crash Recovery

If the agent crashes mid-generation, the journal replays to the last checkpoint. LLM tokens already spent are not re-spent. The user sees the agent pick up right where it left off.

### Scaling

You don't manage servers. OnCell:
- **Creates cells on demand** when users arrive
- **Pauses idle cells** automatically (200ms wake time)
- **Snapshots to S3** for durability (survives host failure)
- **Schedules across hosts** for optimal resource usage
- **Auto-scales** — add more hosts as users grow

### Billing

Usage-based. You pay for compute time and storage. Cells that are paused cost almost nothing ($0.001/hr). Active cells cost $0.05/hr. No minimum commitment.

## How It Uses OnCell

Each project runs in its own **oncell cell** — an isolated compute environment with:

| Primitive | Usage in this agent |
|-----------|-------------------|
| **Store** | Persists generated files (`app/page.tsx`, etc.) across sessions |
| **Database** | Stores conversation history and project metadata |
| **Vector Search** | Indexes generated code so the agent finds relevant context when editing |
| **Journal** | Crash recovery — if the agent dies mid-generation, it picks up where it left off |

```
User: "Build a landing page"
  → Agent creates cell for this project
  → LLM generates code (streamed to UI)
  → Store: writes app/page.tsx
  → Search: indexes the code
  → DB: saves conversation + metadata

User: "Add a pricing section"
  → Search: finds relevant existing code
  → LLM gets existing code + context as input
  → Store: updates app/page.tsx
  → DB: appends to conversation
```

## Quick Start

```bash
git clone https://github.com/oncellai/oncell-demo-agent.git
cd oncell-demo-agent
npm install
```

Create `.env.local`:

```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
MODEL=google/gemini-2.5-flash
ONCELL_API_KEY=oncell_sk_your-key-here
```

- **OPENROUTER_API_KEY** — get from [openrouter.ai](https://openrouter.ai) (for LLM calls)
- **ONCELL_API_KEY** — get from [oncell.ai/dashboard/keys](https://oncell.ai/dashboard/keys) (for cell storage, DB, search)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/oncellai/oncell-demo-agent&env=OPENROUTER_API_KEY,MODEL,ONCELL_API_KEY)

### Netlify

1. Connect the repo in Netlify dashboard
2. Build command: `npm run build`
3. Publish directory: `.next`
4. Add env vars: `OPENROUTER_API_KEY`, `MODEL`, `ONCELL_API_KEY`

### Any Platform

```bash
npm run build && npm start
```

Set `OPENROUTER_API_KEY`, `MODEL`, and `ONCELL_API_KEY` as environment variables.

## Supported Models

Any [OpenRouter](https://openrouter.ai/models) model works:

| Model | Speed | Quality |
|-------|-------|---------|
| `google/gemini-2.5-flash` | Fast | Good |
| `anthropic/claude-sonnet-4` | Medium | Great |
| `openai/gpt-4o` | Medium | Great |
| `openai/gpt-4o-mini` | Fast | Good |

## Stack

- [Next.js 16](https://nextjs.org) + TypeScript + Tailwind CSS 4
- [oncell SDK](https://github.com/oncellai/oncell) — Cell, Store, DB, Search, Journal
- [OpenAI SDK](https://github.com/openai/openai-node) — OpenRouter-compatible
- Babel Standalone — in-browser JSX transform for live preview

## License

MIT

---

Built with [oncell.ai](https://oncell.ai) — per-customer isolated compute for AI agents.
