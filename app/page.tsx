"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [code, setCode] = useState("");
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<"preview" | "code" | "files">("preview");
  const [files, setFiles] = useState<string[]>([]);
  const [projectId] = useState(() => `project-${Date.now().toString(36)}`);
  const [editCount, setEditCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || generating) return;

    const instruction = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: instruction }]);
    setGenerating(true);

    let generated = "";

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, projectId }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              generated += data.text;
              setCode(generated);
            }
            if (data.done && data.meta) {
              setEditCount(data.meta.edits);
              setFiles(data.meta.files || []);
            }
            if (data.error) {
              setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
            }
          } catch {}
        }
      }

      generated = generated
        .replace(/^```(?:tsx?|jsx?|typescript|javascript)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();
      setCode(generated);

      setMessages((prev) => [...prev, { role: "assistant", content: "Done. Check the preview." }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    }

    setGenerating(false);
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-[#e8e4de]">
      {/* Left: Chat */}
      <div className="w-[380px] flex flex-col border-r border-white/[0.06]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
            <rect x="4" y="4" width="24" height="24" rx="6" stroke="#d4a54a" strokeWidth="1.5" fill="none" />
            <circle cx="16" cy="16" r="3" fill="#d4a54a" />
          </svg>
          <span className="font-mono text-sm font-semibold">oncell demo</span>
          {editCount > 0 && (
            <span className="ml-auto text-xs text-white/50 font-mono">{editCount} edit{editCount !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center mt-16">
              <p className="text-white/60 text-sm mb-1">Describe what you want to build</p>
              <p className="text-white/50 text-xs mb-5">Each project gets its own isolated cell with persistent storage, DB, and vector search</p>
              {["A landing page for a SaaS product", "A pricing page with 3 tiers", "A dashboard with charts and stats"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="block w-full text-left text-xs text-white/60 hover:text-white/60 px-3 py-2 mb-2 rounded-lg border border-white/[0.06] hover:border-white/[0.12] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`text-sm px-3 py-2 rounded-lg ${m.role === "user" ? "bg-white/[0.04] text-white/80" : "text-white/50"}`}>
              {m.content}
            </div>
          ))}
          {generating && <div className="text-sm text-[#d4a54a] animate-pulse">Generating...</div>}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-white/[0.06]">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Build a landing page..."
              disabled={generating}
              className="flex-1 bg-[#111] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-[#d4a54a]/50"
            />
            <button
              type="submit"
              disabled={generating || !input.trim()}
              className="px-4 py-2 bg-[#d4a54a] text-[#0a0a0a] text-sm font-semibold rounded-lg disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      </div>

      {/* Right: Preview + Code + Files */}
      <div className="flex-1 flex flex-col">
        <div className="flex border-b border-white/[0.06]">
          <TabBtn label="Preview" active={tab === "preview"} onClick={() => setTab("preview")} />
          <TabBtn label="Code" active={tab === "code"} onClick={() => setTab("code")} />
          <TabBtn label={`Files${files.length ? ` (${files.length})` : ""}`} active={tab === "files"} onClick={() => setTab("files")} />
        </div>

        <div className="flex-1 relative overflow-hidden">
          {tab === "preview" ? (
            code ? (
              <iframe srcDoc={buildPreview(code)} className="w-full h-full border-0 bg-white" sandbox="allow-scripts" />
            ) : (
              <div className="flex items-center justify-center h-full text-white/50 text-sm">Preview will appear here</div>
            )
          ) : tab === "code" ? (
            <pre className="p-4 overflow-auto h-full text-xs font-mono text-white/50 bg-[#0d0d0d] whitespace-pre-wrap">{code || "No code generated yet"}</pre>
          ) : (
            <div className="p-4 space-y-1">
              {files.length === 0 ? (
                <p className="text-white/50 text-sm">No files yet</p>
              ) : (
                files.map((f) => (
                  <div key={f} className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono text-white/60 bg-white/[0.02]">
                    <span className="text-white/50">&#9702;</span>
                    {f}
                  </div>
                ))
              )}
              {files.length > 0 && (
                <p className="text-white/50 text-xs mt-4 pt-3 border-t border-white/[0.04]">
                  Files persist in the cell's storage. Reload the page — your code is still there.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-mono ${active ? "text-[#d4a54a] border-b border-[#d4a54a]" : "text-white/60"}`}>
      {label}
    </button>
  );
}

function buildPreview(code: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/react@19/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@19/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>body{margin:0;font-family:system-ui,sans-serif}</style>
</head><body>
<div id="root"></div>
<script type="text/babel" data-type="module">
const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = React;

${code
  .replace(/^"use client";?\n?/m, "")
  .replace(/import\s+.*?from\s+["'].*?["'];?\n?/gm, "")
  .replace(/export\s+default\s+function\s+(\w+)/m, "function $1")
  .replace(/export\s+default\s+(\w+);?\s*$/m, "")}

const _components = [${
    code.match(/(?:export\s+default\s+)?function\s+(\w+)/g)
      ?.map((m) => m.replace(/export\s+default\s+function\s+/, "").replace(/function\s+/, ""))
      .join(",") || "'div'"
  }];
const App = _components[_components.length - 1];
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
</script>
</body></html>`;
}
