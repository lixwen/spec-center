"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { showError } from "../lib/toast";

const markdownComponents: Components = {
  table: ({ children, ...props }) => (
    <div className="ask-table-wrap">
      <table {...props}>{children}</table>
    </div>
  ),
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
  pre: ({ children, ...props }) => (
    <pre {...props}>{children}</pre>
  )
};

interface RagSource {
  type: "spec" | "change" | "comment";
  title: string;
  href: string;
  project_id?: string;
  project_name?: string;
}

interface AgentStep {
  type: "tool_call" | "tool_result" | "thinking";
  name?: string;
  args?: Record<string, unknown>;
  summary?: string;
  content?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: RagSource[];
  agentSteps?: AgentStep[];
}

interface ConversationSummary {
  _id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

type AskStatus = "idle" | "loading" | "streaming" | "done" | "error";
type CompactStatus = "idle" | "compacting" | "done";

interface AskMessages {
  eyebrow: string;
  title: string;
  description: string;
  placeholder: string;
  placeholderUnconfigured: string;
  send: string;
  stop: string;
  generating: string;
  searching: string;
  unconfiguredError: string;
  sources: string;
  sourceTypes: { spec: string; change: string; comment: string };
  crossProject: string;
  newConversation: string;
  conversations: string;
  noConversations: string;
  requestFailed: string;
  streamError: string;
  agentAnalyzing: string;
  agentToolCall: string;
  agentToolResult: string;
  agentThinking: string;
  agentToggle: string;
  deleteConversation: string;
  compactConversation: string;
  compacting: string;
  compactDone: string;
}

const TOOL_LABELS: Record<string, string> = {
  get_change: "Change",
  get_spec_content: "Spec",
  search_specs: "Search",
  vector_search: "Vector",
  detect_spec_issues: "Issues",
  detect_cross_spec_issues: "Cross-Spec",
  get_review_brief: "Brief",
  get_review_comments: "Comments",
  get_baseline_context: "Baseline",
  get_project_overview: "Overview"
};

function AgentStepsPanel({
  steps,
  messages: t
}: {
  steps: AgentStep[];
  messages: AskMessages;
}) {
  const [open, setOpen] = useState(false);

  if (steps.length === 0) return null;

  const toolCallCount = steps.filter((s) => s.type === "tool_call").length;
  const isActive = steps.length > 0 && !steps.some((s) => s.type === "tool_result" && steps.indexOf(s) === steps.length - 1);

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 transition"
      >
        {isActive && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
        )}
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>
          {isActive ? t.agentAnalyzing : t.agentThinking}
          {toolCallCount > 0 && ` (${toolCallCount})`}
        </span>
      </button>

      {open && (
        <div className="mt-2 ml-4 border-l-2 border-slate-200 pl-3 space-y-1.5">
          {steps.map((step, i) => (
            <div key={i} className="text-xs">
              {step.type === "thinking" && (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <span className="font-medium">💭</span>
                  <span>{step.summary || step.content}</span>
                </div>
              )}
              {step.type === "tool_call" && (
                <div className="flex items-center gap-1.5 text-blue-600">
                  <span className="font-medium">→</span>
                  <span className="font-mono font-medium">
                    {TOOL_LABELS[step.name ?? ""] ?? step.name}
                  </span>
                  {step.args && Object.keys(step.args).length > 0 && (
                    <span className="text-slate-400 font-mono truncate max-w-[200px]">
                      {Object.values(step.args).join(", ")}
                    </span>
                  )}
                </div>
              )}
              {step.type === "tool_result" && (
                <div className="flex items-center gap-1.5 text-green-600">
                  <span className="font-medium">✓</span>
                  <span className="font-mono">
                    {TOOL_LABELS[step.name ?? ""] ?? step.name}
                  </span>
                  {step.summary && (
                    <span className="text-slate-400 truncate max-w-[300px]">
                      {step.summary.slice(0, 80)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ContextUsage {
  used: number;
  total: number;
  percent: number;
  breakdown: { system: number; history: number; currentTurn: number; reservedOutput: number };
  source: "estimate" | "actual";
  modelName?: string;
  compactionLevel: number;
  droppedTurns: number;
}

function ContextRing({ usage }: { usage: ContextUsage | null }) {
  if (!usage) return null;

  const size = 32;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (usage.percent / 100) * circumference;
  const gap = circumference - filled;

  const color =
    usage.percent >= 90 ? "#ef4444" :
    usage.percent >= 70 ? "#f59e0b" :
    "#3b82f6";

  const bgColor =
    usage.percent >= 90 ? "rgba(239,68,68,0.1)" :
    usage.percent >= 70 ? "rgba(245,158,11,0.1)" :
    "rgba(59,130,246,0.08)";

  const formatTokens = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;

  return (
    <div className="group relative flex items-center gap-1.5">
      <svg
        width={size}
        height={size}
        className="transition-all duration-500"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill={bgColor}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${gap}`}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="text-[10px] tabular-nums text-slate-500" style={{ color }}>
        {usage.source === "estimate" ? "~" : ""}{usage.percent}%
      </span>

      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
        <div className="rounded-lg bg-slate-800 px-3 py-2 text-[11px] text-white shadow-lg whitespace-nowrap min-w-[180px]">
          {usage.modelName && (
            <div className="font-medium mb-1 text-slate-300 truncate max-w-[200px]">{usage.modelName}</div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Context</span>
            <span className="tabular-nums">
              {formatTokens(usage.used)} / {formatTokens(usage.total)}
              {usage.source === "estimate" && <span className="ml-1 text-slate-500">~</span>}
            </span>
          </div>
          <div className="mt-1 space-y-0.5 text-slate-400">
            <div className="flex justify-between gap-4">
              <span>System</span>
              <span className="tabular-nums">{formatTokens(usage.breakdown.system)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>History</span>
              <span className="tabular-nums">{formatTokens(usage.breakdown.history)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Current</span>
              <span className="tabular-nums">{formatTokens(usage.breakdown.currentTurn)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Reserved</span>
              <span className="tabular-nums">{formatTokens(usage.breakdown.reservedOutput)}</span>
            </div>
          </div>
          {usage.droppedTurns > 0 && (
            <div className="mt-1 pt-1 border-t border-slate-600 text-amber-400">
              {usage.droppedTurns} turns compacted (L{usage.compactionLevel})
            </div>
          )}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-800" />
        </div>
      </div>
    </div>
  );
}

export function AskClient({
  projectId,
  messages: t
}: {
  projectId: string;
  messages: AskMessages;
}) {
  const [input, setInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AskStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [unconfigured, setUnconfigured] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [crossProject, setCrossProject] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [compactStatus, setCompactStatus] = useState<CompactStatus>("idle");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const askSentAtRef = useRef<number | null>(null);
  const isUserAtBottomRef = useRef(true);
  const lastSeqRef = useRef(0);
  const streamTaskRef = useRef<((taskId: string, afterSeq?: number) => Promise<void>) | undefined>(undefined);
  const loadConversationRef = useRef<((convId: string) => Promise<void>) | undefined>(undefined);
  const submitQueryRef = useRef<((query: string) => Promise<void>) | undefined>(undefined);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const checkIsAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  const scrollToBottom = useCallback((instant?: boolean) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (instant) {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, []);

  const handleScroll = useCallback(() => {
    const atBottom = checkIsAtBottom();
    isUserAtBottomRef.current = atBottom;
    setShowScrollDown(!atBottom);
  }, [checkIsAtBottom]);

  useEffect(() => {
    if (isUserAtBottomRef.current) {
      scrollToBottom(status === "streaming");
    }
  }, [chatMessages, scrollToBottom, status]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.items ?? []);
      }
    } catch {
      showError(t.requestFailed);
    }
  }, [projectId, t.requestFailed]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Sync conversationId ↔ URL ?conv= / ?q= param
  const initialConvLoaded = useRef(false);
  const initialQueryFired = useRef(false);
  useEffect(() => {
    if (initialConvLoaded.current) return;
    initialConvLoaded.current = true;
    const params = new URLSearchParams(window.location.search);
    const convId = params.get("conv");
    if (convId) {
      loadConversationRef.current?.(convId);
    }
  }, []);

  useEffect(() => {
    if (initialQueryFired.current) return;
    initialQueryFired.current = true;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q && !params.get("conv")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState({}, "", url.toString());
      setInput(q);
      setTimeout(() => {
        submitQueryRef.current?.(q);
      }, 0);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (conversationId) {
      url.searchParams.set("conv", conversationId);
    } else {
      url.searchParams.delete("conv");
    }
    window.history.replaceState({}, "", url.toString());
  }, [conversationId]);

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setConversationId(data._id);
        setChatMessages(
          (data.messages ?? []).map((m: ChatMessage & { agent_steps?: AgentStep[] }) => ({
            role: m.role,
            content: m.content,
            sources: m.sources,
            agentSteps: m.agent_steps
          }))
        );
        setStatus("idle");
        setErrorMessage("");
        isUserAtBottomRef.current = true;
        setShowScrollDown(false);
        requestAnimationFrame(() => {
          scrollContainerRef.current && (scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight);
        });

        // Check for an active (running) task and resume streaming
        try {
          const taskRes = await fetch(`/api/conversations/${convId}/active-task`);
          if (taskRes.ok) {
            const taskData = await taskRes.json();
            if (taskData.active && taskData.taskId) {
              streamTaskRef.current?.(taskData.taskId, taskData.lastSeq ?? 0);
            }
          }
        } catch { /* ignore - not critical */ }
      }
    } catch {
      showError(t.requestFailed);
    }
  }, [t.requestFailed]);
  loadConversationRef.current = loadConversation;

  const deleteConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
      if (res.ok) {
        if (conversationId === convId) {
          setConversationId(null);
          setChatMessages([]);
          setStatus("idle");
          setErrorMessage("");
        }
        fetchConversations();
      }
    } catch {
      showError(t.requestFailed);
    }
  }, [conversationId, fetchConversations, t.requestFailed]);

  const handleNewConversation = useCallback(() => {
    setConversationId(null);
    setChatMessages([]);
    setStatus("idle");
    setErrorMessage("");
    setInput("");
    setContextUsage(null);
    setCompactStatus("idle");
  }, []);

  const handleCompact = useCallback(async () => {
    if (!conversationId || compactStatus === "compacting") return;
    setCompactStatus("compacting");
    try {
      const res = await fetch(`/api/conversations/${conversationId}/compact`, {
        method: "POST"
      });
      if (res.ok) {
        setCompactStatus("done");
        setTimeout(() => setCompactStatus("idle"), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        showError(data.error ?? t.requestFailed);
        setCompactStatus("idle");
      }
    } catch {
      showError(t.requestFailed);
      setCompactStatus("idle");
    }
  }, [conversationId, compactStatus, t.requestFailed]);

  const streamTask = useCallback(
    async (taskId: string, afterSeq = 0) => {
      setStatus("streaming");
      setActiveTaskId(taskId);
      lastSeqRef.current = afterSeq;

      const controller = new AbortController();
      abortRef.current = controller;

      let streamedContent = "";
      let streamedSources: RagSource[] = [];
      let streamedSteps: AgentStep[] = [];

      let postMetrics: ((completed: boolean) => Promise<void>) | null = null;

      try {
        const response = await fetch(`/api/ask/${taskId}/stream?after=${afterSeq}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          setStatus("error");
          setErrorMessage(t.streamError);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setStatus("error");
          setErrorMessage(t.streamError);
          return;
        }

        const streamOpenedAt = Date.now();
        let ttftMs: number | undefined;
        let recordedTtft = false;
        let streamEndStatus: string | undefined;

        postMetrics = async () => {};

        const decoder = new TextDecoder();
        let buffer = "";

        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break outer;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            try {
              const event = JSON.parse(jsonStr);
              if (event.seq) lastSeqRef.current = event.seq;

              if (event.type === "context_usage" && event.context_usage) {
                setContextUsage(event.context_usage);
              } else if (event.type === "token" && event.content) {
                if (!recordedTtft && askSentAtRef.current != null) {
                  ttftMs = Date.now() - askSentAtRef.current;
                  recordedTtft = true;
                }
                streamedContent += event.content;
                const captured = streamedContent;
                const capturedSteps = streamedSteps.length > 0 ? [...streamedSteps] : undefined;
                setChatMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return [...prev.slice(0, -1), { ...last, content: captured, agentSteps: capturedSteps }];
                  }
                  return [...prev, { role: "assistant", content: captured, agentSteps: capturedSteps }];
                });
              } else if (event.type === "sources" && event.items) {
                streamedSources = event.items;
                const captured = streamedSources;
                setChatMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return [...prev.slice(0, -1), { ...last, sources: captured }];
                  }
                  return prev;
                });
              } else if (event.type === "tool_call" || event.type === "tool_result" || event.type === "thinking") {
                streamedSteps.push({
                  type: event.type,
                  name: event.name,
                  args: event.args,
                  summary: event.summary,
                  content: event.content
                });
                const capturedSteps = [...streamedSteps];
                const capturedContent = streamedContent;
                setChatMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return [...prev.slice(0, -1), { ...last, agentSteps: capturedSteps }];
                  }
                  return [...prev, { role: "assistant", content: capturedContent, agentSteps: capturedSteps }];
                });
              } else if (event.type === "error") {
                setErrorMessage(event.content ?? "Unknown error");
                setStatus("error");
                setActiveTaskId(null);
                await postMetrics?.(false);
                return;
              } else if (event.type === "stream_end") {
                streamEndStatus = event.status;
                break outer;
              }
            } catch {
              // skip malformed events
            }
          }
        }

        await postMetrics?.(streamEndStatus === "done");
        setStatus("done");
        setActiveTaskId(null);
        fetchConversations();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setStatus("done");
        } else {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : t.requestFailed);
        }
        setActiveTaskId(null);
        if (postMetrics) {
          await postMetrics(false);
        }
      }
    },
    [t, fetchConversations]
  );
  streamTaskRef.current = streamTask;

  const submitQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      setChatMessages((prev) => [...prev, userMsg]);
      setInput("");
      setErrorMessage("");
      setStatus("loading");
      isUserAtBottomRef.current = true;
      setShowScrollDown(false);

      askSentAtRef.current = Date.now();

      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            projectId,
            conversationId: conversationId ?? undefined,
            crossProject: crossProject || undefined
          })
        });

        if (response.status === 503) {
          setUnconfigured(true);
          setStatus("error");
          setErrorMessage(t.unconfiguredError);
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setStatus("error");
          setErrorMessage(data.error ?? `${t.requestFailed} (${response.status})`);
          return;
        }

        const { taskId, conversationId: convId } = await response.json();
        setConversationId(convId);

        await streamTask(taskId, 0);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setStatus("done");
        } else {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : t.requestFailed);
        }
      }
    },
    [projectId, conversationId, crossProject, t, streamTask]
  );
  submitQueryRef.current = submitQuery;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || status === "loading" || status === "streaming") return;
      await submitQuery(input);
    },
    [input, status, submitQuery]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("done");
    setActiveTaskId(null);
  }, []);

  return (
    <div className="flex gap-6" style={{ minHeight: "calc(100vh - 280px)" }}>
      {/* Sidebar */}
      <div
        className={`shrink-0 transition-all ${sidebarOpen ? "w-64" : "w-0 overflow-hidden"}`}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
            {t.conversations}
          </p>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-slate-400 hover:text-slate-600 text-xs"
          >
            &laquo;
          </button>
        </div>
        <button
          onClick={handleNewConversation}
          className="mb-3 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:border-blue-400 hover:text-blue-600"
        >
          + {t.newConversation}
        </button>
        <div className="space-y-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 380px)" }}>
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-400 px-2 py-3">{t.noConversations}</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv._id}
                className={`group relative rounded-md text-sm transition ${
                  conversationId === conv._id
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <button
                  onClick={() => loadConversation(conv._id)}
                  className="w-full px-3 py-2 text-left"
                >
                  <div className="truncate font-medium pr-5">{conv.title}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv._id);
                  }}
                  className="absolute right-2 top-2.5 hidden group-hover:block rounded p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                  title={t.deleteConversation}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="mb-3 self-start text-xs text-slate-400 hover:text-slate-600"
          >
            &raquo; {t.conversations}
          </button>
        )}

        {/* Messages */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="relative flex-1 overflow-y-auto space-y-4 pb-4"
          style={{ maxHeight: "calc(100vh - 380px)" }}
        >
          {chatMessages.length === 0 && status === "idle" && (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              {t.noConversations}
            </div>
          )}

          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-[var(--surface-card)]"
                }`}
              >
                {msg.role === "assistant" && msg.agentSteps && msg.agentSteps.length > 0 && (
                  <AgentStepsPanel steps={msg.agentSteps} messages={t} />
                )}

                {msg.role === "assistant" ? (
                  <div className="ask-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}

                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200/50">
                    <p className="font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-2">
                      {t.sources}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.sources.map((source, j) => (
                        <Link
                          key={j}
                          href={source.href}
                          className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-low)] px-2 py-1 text-xs transition hover:bg-[var(--surface-high)]"
                        >
                          {source.project_name && (
                            <span className="rounded bg-blue-100 px-1 py-0.5 font-[family-name:var(--font-mono)] text-[9px] text-blue-700">
                              {source.project_name}
                            </span>
                          )}
                          <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.1em] text-slate-500">
                            {t.sourceTypes[source.type] ?? source.type}
                          </span>
                          <span className="text-slate-700">{source.title}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {status === "loading" && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-[var(--surface-card)] px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  {t.searching}
                </div>
              </div>
            </div>
          )}

          {status === "streaming" && !chatMessages.some((m) => m.role === "assistant" && m.agentSteps && m.agentSteps.length > 0 && !m.content) && (
            <div className="flex justify-start">
              <div className="text-sm text-slate-400 flex items-center gap-2 px-4">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                {t.generating}
              </div>
            </div>
          )}

        </div>

        {/* Scroll to bottom */}
        {showScrollDown && (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                scrollToBottom();
                isUserAtBottomRef.current = true;
                setShowScrollDown(false);
              }}
              className="absolute -top-10 left-1/2 -translate-x-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          </div>
        )}

        {/* Error */}
        {errorMessage && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Input */}
        <div className="flex items-center gap-2 pt-3 border-t border-slate-200 pb-2">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <button
              type="button"
              role="switch"
              aria-checked={crossProject}
              onClick={() => setCrossProject((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                crossProject ? "bg-blue-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  crossProject ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </button>
            <span className="text-xs text-slate-600">{t.crossProject}</span>
          </label>
        </div>
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={unconfigured ? t.placeholderUnconfigured : t.placeholder}
            disabled={unconfigured}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          />
          <ContextRing usage={contextUsage} />
          {conversationId && chatMessages.length >= 4 && status !== "streaming" && status !== "loading" && (
            <button
              type="button"
              onClick={handleCompact}
              disabled={compactStatus === "compacting"}
              className="group relative shrink-0 rounded-md border border-slate-300 p-1.5 text-slate-400 transition hover:border-amber-400 hover:text-amber-600 disabled:cursor-wait disabled:opacity-60"
              title={compactStatus === "done" ? t.compactDone : t.compactConversation}
            >
              {compactStatus === "compacting" ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : compactStatus === "done" ? (
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h4m10 0h4" />
                </svg>
              )}
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white group-hover:block">
                {compactStatus === "compacting" ? t.compacting : compactStatus === "done" ? t.compactDone : t.compactConversation}
              </span>
            </button>
          )}
          {status === "streaming" ? (
            <button
              type="button"
              onClick={handleStop}
              className="rounded-lg bg-slate-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {t.stop}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || status === "loading" || unconfigured}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {t.send}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
