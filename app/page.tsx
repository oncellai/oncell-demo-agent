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
  const [projectId, setProjectId] = useState("");
  const [editCount, setEditCount] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [cellId, setCellId] = useState("");
  const [cellReady, setCellReady] = useState(false);
  const [creatingCell, setCreatingCell] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const previewUrl = cellId ? `https://${cellId}.${CELLS_DOMAIN}` : "";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function startNewProject() {
    const id = `demo-${Date.now().toString(36)}`;
    setProjectId(id);
    setMessages([]);
    setCode("");
    setFiles([]);
    setEditCount(0);
    setPreviewReady(false);
    setCellId("");
    setCellReady(false);
    setCreatingCell(false);
    // Cell is NOT created here — it's created lazily on first message
  }

  async function ensureCell(id: string): Promise<boolean> {
    if (cellReady && cellId) return true;
    setCreatingCell(true);
    try {
      const res = await fetch("/api/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      const data = await res.json();
      if (data.cellId) {
        setCellId(data.cellId);
        setCellReady(true);
        setCreatingCell(false);
        return true;
      }
    } catch (err) {
      console.error("Failed to create cell:", err);
    }
    setCreatingCell(false);
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || generating) return;

    const instruction = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: instruction }]);
    setGenerating(true);

    // Create cell on first message (lazy — no cell until user actually sends)
    if (!cellReady) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Creating environment..." }]);
      const ok = await ensureCell(projectId);
      if (!ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Failed to create environment. Try again." }]);
        setGenerating(false);
        return;
      }
      // Remove the "Creating environment..." message
      setMessages((prev) => prev.filter((m) => m.content !== "Creating environment..."));
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, projectId }),
      });

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
        // STREAMING — agent is streaming from inside the cell
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
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.status === "calling_llm") {
                setMessages((prev) => [...prev.filter(m => m.role !== "status"), { role: "assistant" as const, content: `Calling ${data.model}...` }]);
              }
              if (data.status === "writing") {
                setMessages((prev) => [...prev.filter(m => !m.content.startsWith("Calling")), { role: "assistant" as const, content: `Writing ${data.lines} lines...` }]);
              }
              if (data.text) {
                codeRef += data.text;
                setCode(codeRef);
                setTab("code");
              }
              if (data.done) {
                setCode(data.code || codeRef);
                setEditCount(data.edits || editCount + 1);
                setFiles(data.files || []);
                setPreviewReady(true);
                setTab("preview");
              }
              if (data.error) {
                setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
              }
            } catch {}
          }
        }

        codeRef = codeRef.replace(/^```(?:html?)?\n?/gm, "").replace(/```$/gm, "").trim();
        if (codeRef) setCode(codeRef);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `Wrote index.html (${codeRef.split("\n").length} lines). Preview is live.`
        }]);
      } else {
        // SYNC/ASYNC — agent returned JSON
        const data = await res.json();
        if (data.error) {
          setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
        } else {
          setCode(data.code || "");
          setEditCount(data.edits || editCount + 1);
          setFiles(data.files || []);
          setPreviewReady(true);
          setTab("preview");
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Wrote index.html (${(data.code || "").split("\n").length} lines). Preview is live.`
          }]);
        }
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    }

    setGenerating(false);
  }

  // No project yet — show landing
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-[#e8e4de]">
        <div className="text-center max-w-md">
          <div className="flex items-center justify-center gap-2 mb-6">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="4" width="24" height="24" rx="6" stroke="#d4a54a" strokeWidth="1.5" fill="none" />
              <circle cx="16" cy="16" r="3" fill="#d4a54a" />
            </svg>
            <span className="font-mono text-lg font-semibold">oncell demo</span>
          </div>
          <p className="text-white/50 text-sm mb-2">AI coding agent powered by oncell.ai</p>
          <p className="text-white/30 text-xs mb-8">Each project gets its own isolated cell with persistent storage, database, and vector search.</p>
          <button
            onClick={startNewProject}
            disabled={false}
            className="px-6 py-3 bg-[#d4a54a] text-[#0a0a0a] text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            New Project
          </button>
        </div>
      </div>
    );
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
          <button
            onClick={startNewProject}
            disabled={false}
            className="ml-auto text-xs text-white/40 hover:text-white/70 border border-white/10 px-2 py-1 rounded"
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center mt-16">
              <p className="text-white/60 text-sm mb-1">Describe what you want to build</p>
              <p className="text-white/40 text-xs mb-5">This project runs in an isolated oncell cell</p>
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
          {generating && (
            <div className="rounded-lg overflow-hidden border border-white/[0.06]">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.04]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#d4a54a] animate-pulse" />
                <span className="text-xs text-white/40 font-mono">index.html</span>
                <span className="text-xs text-white/25 ml-auto font-mono">{code.split("\n").length} lines</span>
              </div>
              <pre className="p-3 text-[10px] font-mono text-white/40 max-h-[200px] overflow-y-auto bg-[#0d0d0d] whitespace-pre-wrap">
                {code.slice(-500) || "..."}
              </pre>
            </div>
          )}
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
                {cellReady ? "Preview will appear after first generation" : "Create a project to get started"}
              </div>
            )
          ) : tab === "code" ? (
            <div className="overflow-auto h-full bg-[#0d0d0d]">
              <pre className="p-4 text-[13px] leading-5 font-mono whitespace-pre">
                {code ? highlightHTML(code) : <span className="text-white/40">No code generated yet</span>}
              </pre>
            </div>
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

function highlightHTML(code: string) {
  const lines = code.split("\n");
  return lines.map((line, i) => (
    <div key={i} className="flex">
      <span className="w-10 text-right pr-4 text-white/20 select-none shrink-0">{i + 1}</span>
      <span dangerouslySetInnerHTML={{ __html: colorize(line) }} />
    </div>
  ));
}

function colorize(line: string): string {
  return line
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // HTML comments
    .replace(/(<!--.*?-->|&lt;!--.*?--&gt;)/g, '<span style="color:#555">$1</span>')
    // Tags
    .replace(/(&lt;\/?)([\w-]+)/g, '$1<span style="color:#e85454">$2</span>')
    // Attributes
    .replace(/\s([\w-]+)(=)/g, ' <span style="color:#d4a54a">$1</span>$2')
    // Strings
    .replace(/"([^"]*)"/g, '<span style="color:#5cdb7f">"$1"</span>')
    // JS keywords
    .replace(/\b(function|const|let|var|return|if|else|for|class|document|window|addEventListener)\b/g,
      '<span style="color:#c9a0ff">$1</span>');
}
