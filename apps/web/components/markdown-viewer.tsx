"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ToastViewerConstructor = {
  new (options: { el: HTMLElement; initialValue?: string; usageStatistics?: boolean }): {
    destroy(): void;
    setMarkdown(markdown: string): void;
  };
};

function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="10 2 14 2 14 6" />
      <polyline points="6 14 2 14 2 10" />
      <line x1="14" y1="2" x2="9.5" y2="6.5" />
      <line x1="2" y1="14" x2="6.5" y2="9.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  );
}

function FullscreenOverlay({
  content,
  onClose
}: {
  content: string;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<InstanceType<ToastViewerConstructor> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function mount() {
      if (!hostRef.current) return;
      const module = await import("@toast-ui/editor/viewer");
      const Viewer = module.default as ToastViewerConstructor;
      if (cancelled || !hostRef.current) return;
      hostRef.current.innerHTML = "";
      viewerRef.current = new Viewer({
        el: hostRef.current,
        initialValue: content,
        usageStatistics: false
      });
    }
    void mount();
    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [content]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="markdown-viewer relative my-8 w-full max-w-4xl rounded-2xl border border-[rgba(115,118,134,0.12)] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-end rounded-t-2xl border-b border-[rgba(115,118,134,0.08)] bg-white/90 px-6 py-3 backdrop-blur-sm">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <CloseIcon />
          </button>
        </div>
        <div ref={hostRef} className="px-10 py-8" />
      </div>
    </div>,
    document.body
  );
}

export function MarkdownFullscreenButton({
  content
}: {
  content: string;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const handleClose = useCallback(() => setIsFullscreen(false), []);

  return (
    <>
      <button
        onClick={() => setIsFullscreen(true)}
        className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--surface-low)] px-2.5 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.14em] text-slate-500 transition hover:bg-[var(--surface-high)] hover:text-slate-700"
      >
        <ExpandIcon />
      </button>
      {isFullscreen ? <FullscreenOverlay content={content} onClose={handleClose} /> : null}
    </>
  );
}

export function MarkdownViewer({
  content,
  className
}: {
  content: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<InstanceType<ToastViewerConstructor> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function mountViewer() {
      if (!hostRef.current) {
        return;
      }

      const module = await import("@toast-ui/editor/viewer");
      const Viewer = module.default as ToastViewerConstructor;

      if (cancelled || !hostRef.current) {
        return;
      }

      hostRef.current.innerHTML = "";
      viewerRef.current = new Viewer({
        el: hostRef.current,
        initialValue: content,
        usageStatistics: false
      });
    }

    void mountViewer();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewerRef.current?.setMarkdown(content);
  }, [content]);

  return (
    <article
      className={[
        "markdown-viewer overflow-hidden rounded-[20px] border border-[rgba(115,118,134,0.12)] bg-white/72 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur-sm",
        className ?? ""
      ].join(" ")}
    >
      <div ref={hostRef} className="markdown-viewer__host min-h-[160px] px-6 py-6 md:px-8 md:py-8" />
    </article>
  );
}
