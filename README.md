# oncell-demo-agent

A coding agent built on [oncell.ai](https://oncell.ai) — generates Next.js apps from natural language instructions.

Type what you want, get a working React component with a live preview.

## Quick Start

```bash
git clone https://github.com/oncellai/oncell-demo-agent.git
cd oncell-demo-agent
npm install
```

Create `.env.local` with your API key:

```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
MODEL=google/gemini-2.5-flash
```

Get an API key from [openrouter.ai](https://openrouter.ai). Any OpenAI-compatible provider works — just change the base URL in `app/api/generate/route.ts`.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

1. You type a natural language instruction ("Build a pricing page with 3 tiers")
2. The instruction is sent to an LLM via OpenRouter
3. The LLM streams back a complete React/TypeScript component
4. A live preview renders the component in an iframe using Babel + Tailwind CDN
5. Send follow-up messages to iterate on the code

## Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/oncellai/oncell-demo-agent&env=OPENROUTER_API_KEY,MODEL)

1. Click the button above
2. Add environment variables:
   - `OPENROUTER_API_KEY` — your OpenRouter API key
   - `MODEL` — model to use (default: `google/gemini-2.5-flash`)
3. Deploy

### Netlify

1. Connect the repo in Netlify dashboard
2. Build command: `npm run build`
3. Publish directory: `.next`
4. Add environment variables: `OPENROUTER_API_KEY`, `MODEL`

### Any Platform

This is a standard Next.js app. Deploy it anywhere that supports Node.js:

```bash
npm run build
npm start
```

Set `OPENROUTER_API_KEY` and `MODEL` as environment variables.

## Supported Models

Any model available on [OpenRouter](https://openrouter.ai/models) works. Recommended:

| Model | Speed | Quality | Cost |
|-------|-------|---------|------|
| `google/gemini-2.5-flash` | Fast | Good | $0.15/M input |
| `anthropic/claude-sonnet-4` | Medium | Great | $3/M input |
| `openai/gpt-4o` | Medium | Great | $2.50/M input |
| `openai/gpt-4o-mini` | Fast | Good | $0.15/M input |

## Stack

- [Next.js 16](https://nextjs.org) — App Router
- [Tailwind CSS 4](https://tailwindcss.com)
- [OpenAI SDK](https://github.com/openai/openai-node) — OpenRouter-compatible
- [Babel Standalone](https://babeljs.io/docs/babel-standalone) — in-browser JSX transform for preview

## License

MIT

---

Built with [oncell.ai](https://oncell.ai) — per-customer isolated compute for AI agents.
