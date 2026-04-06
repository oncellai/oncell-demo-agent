# oncell-demo-agent

A coding agent built on [oncell.ai](https://oncell.ai) — generates Next.js apps from natural language instructions.

Type what you want. The agent generates code inside an isolated cell. Live preview at `{cell-id}.cells.oncell.ai`.

## Architecture

```
┌────────────────────┐                ┌──────────────────────────┐
│  Demo Frontend     │                │  oncell platform         │
│  (Vercel/Netlify)  │                │                          │
│                    │   oncell API   │  ┌────────────────────┐  │
│  Chat UI ─────────────────────────────▶│ Cell (per project) │  │
│                    │                │  │                    │  │
│  Preview iframe    │   *.cells.     │  │  agent.ts runs     │  │
│  ──────────────────│───oncell.ai────│──│  inside gVisor     │  │
│  {cell-id}.cells.  │                │  │                    │  │
│  oncell.ai         │                │  │  ┌──────────────┐  │  │
│                    │                │  │  │ Store (files) │  │  │
└────────────────────┘                │  │  │ DB (convos)   │  │  │
                                      │  │  │ Search (code) │  │  │
                                      │  │  │ Next.js dev   │  │  │
                                      │  │  └──────────────┘  │  │
                                      │  └────────────────────┘  │
                                      └──────────────────────────┘
```

**The frontend is just a client. All compute happens in oncell cells.**

## What OnCell Handles

| Concern | How |
|---------|-----|
| **Isolation** | Each user gets a gVisor-sandboxed cell. Cells can't see each other. |
| **Storage** | Files persist on NVMe. User comes back tomorrow, code is still there. |
| **Security** | Kernel-level sandbox, network isolation, encrypted storage. |
| **Scaling** | Cells created on demand, paused when idle (200ms wake), auto-scheduled across hosts. |
| **Crash recovery** | Journal replays to last checkpoint. No lost work. |
| **Preview** | Each cell gets `{cell-id}.cells.oncell.ai` — a live URL serving the Next.js app. |

## Repo Structure

```
oncell-demo-agent/
├── agent/              ← the oncell agent (published via: oncell publish)
│   ├── agent.ts        ← coding agent: setup, generate, status
│   └── package.json
├── app/                ← demo frontend (deployed to Vercel/Netlify)
│   ├── page.tsx        ← chat UI + preview iframe
│   ├── api/generate/   ← proxy to oncell API
│   └── api/project/    ← proxy to oncell API
├── .env.local          ← API keys (not committed)
└── package.json
```

## Quick Start

### 1. Publish the agent to oncell

```bash
cd agent
npm install
oncell login
oncell publish
```

### 2. Run the frontend

```bash
cd ..
npm install
```

Create `.env.local`:

```
ONCELL_API_URL=https://api.oncell.ai
ONCELL_API_KEY=oncell_sk_your-key-here
NEXT_PUBLIC_CELLS_DOMAIN=cells.oncell.ai
```

Get an API key from [oncell.ai/dashboard/keys](https://oncell.ai/dashboard/keys).

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy Frontend

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/oncellai/oncell-demo-agent&env=ONCELL_API_KEY,ONCELL_API_URL,NEXT_PUBLIC_CELLS_DOMAIN)

### Any Platform

```bash
npm run build && npm start
```

Set `ONCELL_API_KEY`, `ONCELL_API_URL`, and `NEXT_PUBLIC_CELLS_DOMAIN` as env vars.

## How It Works

1. User types "Build a pricing page" in the chat
2. Frontend calls `POST /api/generate` (proxies to oncell API)
3. oncell creates a cell for this user (if first request) or resumes it
4. Agent inside the cell:
   - Calls LLM with instruction + existing code context (vector search)
   - Writes generated code to cell store (`app/page.tsx`)
   - Next.js dev server inside the cell picks up the change
5. Preview loads in iframe at `https://{cell-id}.cells.oncell.ai`
6. User sends follow-up → agent edits code → preview updates

## License

MIT

---

Built with [oncell.ai](https://oncell.ai) — per-customer isolated compute for AI agents.
