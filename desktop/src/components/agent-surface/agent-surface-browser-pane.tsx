import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw } from "lucide-react";

function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (
    /^localhost(:\d+)?(\/|$)/i.test(trimmed) ||
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(trimmed)
  ) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

function hostLabel(url: string): string {
  try {
    const host = new URL(url).host;
    return host || "Browser";
  } catch {
    return "Browser";
  }
}

async function openExternal(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export type AgentSurfaceBrowserPaneProps = {
  initialUrl?: string | null;
  onUrlChange?: (url: string, title: string) => void;
};

export function AgentSurfaceBrowserPane({
  initialUrl = null,
  onUrlChange,
}: AgentSurfaceBrowserPaneProps) {
  const iframeId = useId();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [draft, setDraft] = useState(initialUrl ?? "");
  const [url, setUrl] = useState(initialUrl?.trim() || "");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>(() =>
    initialUrl?.trim() ? [initialUrl.trim()] : [],
  );
  const [historyIndex, setHistoryIndex] = useState(0);

  useEffect(() => {
    if (!initialUrl?.trim()) return;
    if (url) return;
    const next = normalizeBrowserUrl(initialUrl);
    if (!next) return;
    setUrl(next);
    setDraft(next);
    setHistory([next]);
    setHistoryIndex(0);
  }, [initialUrl, url]);

  const navigate = useCallback(
    (raw: string) => {
      const next = normalizeBrowserUrl(raw);
      if (!next) return;
      setUrl(next);
      setDraft(next);
      setLoading(true);
      onUrlChange?.(next, hostLabel(next));
      setHistory((current) => {
        const clipped = current.slice(0, historyIndex + 1);
        if (clipped[clipped.length - 1] === next) {
          return clipped;
        }
        const updated = [...clipped, next];
        setHistoryIndex(updated.length - 1);
        return updated;
      });
    },
    [historyIndex, onUrlChange],
  );

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    navigate(draft);
  };

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  if (!url) {
    return (
      <div className="agent-surface-pane agent-surface-pane--browser">
        <div className="agent-surface-browser-empty">
          <Globe size={20} aria-hidden strokeWidth={1.6} />
          <h3>No preview yet</h3>
          <p>Type a URL below, or open a local dev server (e.g. localhost:5173).</p>
          <form className="agent-surface-browser-empty__form" onSubmit={submit}>
            <input
              type="text"
              className="agent-surface-browser-url"
              value={draft}
              placeholder="http://localhost:5173"
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              aria-label="URL"
            />
            <button type="submit" className="agent-surface-browser-go">
              Open
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-surface-pane agent-surface-pane--browser">
      <form className="agent-surface-browser-chrome" onSubmit={submit}>
        <div className="agent-surface-browser-nav" role="group" aria-label="Navigation">
          <button
            type="button"
            className="agent-surface-browser-nav-btn"
            disabled={!canGoBack}
            aria-label="Back"
            onClick={() => {
              if (!canGoBack) return;
              const nextIndex = historyIndex - 1;
              const next = history[nextIndex];
              if (!next) return;
              setHistoryIndex(nextIndex);
              setUrl(next);
              setDraft(next);
              setLoading(true);
              onUrlChange?.(next, hostLabel(next));
            }}
          >
            <ArrowLeft size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="agent-surface-browser-nav-btn"
            disabled={!canGoForward}
            aria-label="Forward"
            onClick={() => {
              if (!canGoForward) return;
              const nextIndex = historyIndex + 1;
              const next = history[nextIndex];
              if (!next) return;
              setHistoryIndex(nextIndex);
              setUrl(next);
              setDraft(next);
              setLoading(true);
              onUrlChange?.(next, hostLabel(next));
            }}
          >
            <ArrowRight size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="agent-surface-browser-nav-btn"
            aria-label="Refresh"
            onClick={() => {
              const frame = iframeRef.current;
              if (!frame) return;
              setLoading(true);
              frame.src = url;
            }}
          >
            <RotateCw
              size={14}
              aria-hidden
              className={loading ? "is-spinning" : undefined}
            />
          </button>
        </div>
        <input
          type="text"
          className="agent-surface-browser-url"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="URL"
        />
        <button
          type="button"
          className="agent-surface-browser-nav-btn"
          aria-label="Open in system browser"
          title="Open in system browser"
          onClick={() => void openExternal(url)}
        >
          <ExternalLink size={14} aria-hidden />
        </button>
      </form>
      <iframe
        id={iframeId}
        ref={iframeRef}
        className="agent-surface-browser-frame"
        title="Browser preview"
        src={url}
        onLoad={() => setLoading(false)}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>
  );
}
