"use client";

import { useState, useRef, useEffect } from "react";

const CELLS_DOMAIN = process.env.NEXT_PUBLIC_CELLS_DOMAIN || "cells.oncell.ai";

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
  const [projectId] = useState(() => `demo-${Date.now().toString(36)}`);
  const [editCount, setEditCount] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [cellId, setCellId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const previewUrl = cellId ? `https://${cellId}.${CELLS_DOMAIN}` : "";

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

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, projectId }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let codeRef = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.cellId) setCellId(data.cellId);
            if (data.text) {
              codeRef += data.text;
              setCode(codeRef);
              setTab("code"); // auto-switch to code tab while streaming
            }
            if (data.done) {
              setEditCount(data.edits || editCount + 1);
              setFiles(data.files || []);
              setPreviewReady(true);
              setTab("preview"); // switch to preview when done
            }
          } catch {}
        }
      }

      codeRef = codeRef.replace(/^```(?:html?)?\n?/gm, "").replace(/```$/gm, "").trim();
      setCode(codeRef);
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

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center mt-16">
              <p className="text-white/60 text-sm mb-1">Describe what you want to build</p>
              <p className="text-white/40 text-xs mb-5">Each project gets its own isolated cell on oncell.ai</p>
              {["A landing page for a SaaS product", "A pricing page with 3 tiers", "A dashboard with charts and stats"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="block w-full text-left text-xs text-white/60 hover:text-white/80 px-3 py-2 mb-2 rounded-lg border border-white/[0.06] hover:border-white/[0.12] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`text-sm px-3 py-2 rounded-lg ${m.role === "user" ? "bg-white/[0.04] text-white/80" : "text-white/60"}`}>
              {m.content}
            </div>
          ))}
          {generating && <div className="text-sm text-[#d4a54a] animate-pulse">Generating...</div>}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="p-3 border-t border-white/[0.06]">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Build a landing page..."
              disabled={generating}
              className="flex-1 bg-[#111] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-[#d4a54a]/50"
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
          {previewReady && (
            <a href={previewUrl} target="_blank" rel="noopener" className="ml-auto px-3 py-2 text-xs text-white/40 hover:text-white/60 font-mono">
              Open in new tab
            </a>
          )}
        </div>

        <div className="flex-1 relative overflow-hidden">
          {tab === "preview" ? (
            previewReady ? (
              <iframe src={previewUrl} className="w-full h-full border-0 bg-white" />
            ) : (
              <div className="flex items-center justify-center h-full text-white/40 text-sm">
                Preview will appear here after first generation
              </div>
            )
          ) : tab === "code" ? (
            <pre className="p-4 overflow-auto h-full text-xs font-mono text-white/60 bg-[#0d0d0d] whitespace-pre-wrap">
              {code || "No code generated yet"}
            </pre>
          ) : (
            <div className="p-4 space-y-1">
              {files.length === 0 ? (
                <p className="text-white/50 text-sm">No files yet</p>
              ) : (
                files.map((f) => (
                  <div key={f} className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono text-white/60 bg-white/[0.02]">
                    {f}
                  </div>
                ))
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
    <button onClick={onClick} className={`px-4 py-2 text-sm font-mono ${active ? "text-[#d4a54a] border-b border-[#d4a54a]" : "text-white/40"}`}>
      {label}
    </button>
  );
}
