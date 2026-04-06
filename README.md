# oncell-demo-agent

A coding agent built on [oncell.ai](https://oncell.ai) — generates Next.js apps from natural language instructions.

Type what you want, get a working React component with a live preview. Every project gets its own isolated cell with persistent storage, database, and vector search.

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
```

Get an API key from [openrouter.ai](https://openrouter.ai).

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/oncellai/oncell-demo-agent&env=OPENROUTER_API_KEY,MODEL)

### Netlify

1. Connect the repo in Netlify dashboard
2. Build command: `npm run build`
3. Publish directory: `.next`
4. Add env vars: `OPENROUTER_API_KEY`, `MODEL`

### Any Platform

```bash
npm run build && npm start
```

Set `OPENROUTER_API_KEY` and `MODEL` as environment variables.

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
