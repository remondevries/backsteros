import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw } from "lucide-react";
import type { UnlistenFn } from "@tauri-apps/api/event";

import {
  agentBrowserCreate,
  agentBrowserDestroy,
  agentBrowserGoBack,
  agentBrowserGoForward,
  agentBrowserHide,
  agentBrowserLabel,
  agentBrowserNavigate,
  agentBrowserReload,
  agentBrowserSetBounds,
  agentBrowserShow,
  isAgentBrowserAvailable,
  listenAgentBrowserLoad,
  listenAgentBrowserTitle,
  readElementBounds,
} from "../../lib/agent/agent-browser-webview";
import {
  AGENT_SURFACE_FOCUS,
  AGENT_SURFACE_FOCUS_ATTR,
} from "../../lib/agent/agent-surface-focus";

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

const FOCUS_BROWSER_ADDRESS_EVENT = "backsteros:focus-browser-address";

export { FOCUS_BROWSER_ADDRESS_EVENT };

export type AgentSurfaceBrowserPaneProps = {
  /** Agent-surface tab id — used as the native webview label suffix. */
  tabId: string;
  /** Whether this browser pane is the active surface tab. */
  active?: boolean;
  /**
   * When true, hide the native webview even if this tab is active.
   * Native Tauri webviews paint above HTML, so CSS z-index cannot cover
   * dropdowns that overlap the page (e.g. the surface + menu).
   */
  overlayOpen?: boolean;
  initialUrl?: string | null;
  onUrlChange?: (url: string, title: string) => void;
};

export function AgentSurfaceBrowserPane({
  tabId,
  active = true,
  overlayOpen = false,
  initialUrl = null,
  onUrlChange,
}: AgentSurfaceBrowserPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const createdRef = useRef(false);
  const urlRef = useRef(initialUrl?.trim() || "");
  const activeRef = useRef(active);
  const onUrlChangeRef = useRef(onUrlChange);
  const label = agentBrowserLabel(tabId);
  const native = isAgentBrowserAvailable();

  activeRef.current = active;

  const [draft, setDraft] = useState(initialUrl ?? "");
  const [url, setUrl] = useState(initialUrl?.trim() || "");
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onUrlChangeRef.current = onUrlChange;
  }, [onUrlChange]);

  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const focusAddressBar = useCallback(() => {
    const input = urlInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  // ⌘L / Ctrl+L — focus address bar when this browser tab is active.
  // Native menu accelerator covers the case where the child webview has focus;
  // the keydown listener covers focus already in the React shell.
  useEffect(() => {
    if (!active) return;

    const onFocusAddress = () => {
      focusAddressBar();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key !== "l" && event.key !== "L") return;
      event.preventDefault();
      event.stopPropagation();
      focusAddressBar();
    };

    window.addEventListener(FOCUS_BROWSER_ADDRESS_EVENT, onFocusAddress);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener(FOCUS_BROWSER_ADDRESS_EVENT, onFocusAddress);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [active, focusAddressBar]);

  useEffect(() => {
    if (!initialUrl?.trim()) return;
    if (url) return;
    const next = normalizeBrowserUrl(initialUrl);
    if (!next) return;
    setUrl(next);
    setDraft(next);
  }, [initialUrl, url]);

  const syncBounds = useCallback(async () => {
    if (!native || !createdRef.current) return;
    const host = hostRef.current;
    if (!host) return;
    try {
      await agentBrowserSetBounds(label, readElementBounds(host));
    } catch {
      /* webview may have been destroyed */
    }
  }, [label, native]);

  const ensureWebview = useCallback(
    async (nextUrl: string) => {
      if (!native) {
        setError("In-app browser requires the desktop app.");
        return;
      }
      const host = hostRef.current;
      if (!host) return;
      const bounds = readElementBounds(host);
      setError(null);
      try {
        if (!createdRef.current) {
          await agentBrowserCreate(label, nextUrl, bounds);
          createdRef.current = true;
        } else {
          await agentBrowserNavigate(label, nextUrl);
          await agentBrowserSetBounds(label, bounds);
        }
        if (activeRef.current) {
          await agentBrowserShow(label);
        } else {
          await agentBrowserHide(label);
        }
      } catch (err) {
        createdRef.current = false;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    },
    [label, native],
  );

  // Create / navigate when the committed URL changes (not on active toggle).
  useEffect(() => {
    if (!url || !native) return;
    let cancelled = false;
    const run = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      if (cancelled) return;
      setLoading(true);
      await ensureWebview(url);
      if (cancelled && createdRef.current) {
        createdRef.current = false;
        try {
          await agentBrowserDestroy(label);
        } catch {
          /* ignore */
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [url, native, ensureWebview, label]);

  // Show / hide when active tab changes (native webviews ignore CSS visibility).
  // Also hide while an HTML overlay (surface + menu) is open — native layers
  // paint above the page and cannot be covered with z-index.
  useEffect(() => {
    if (!native || !createdRef.current) return;
    let cancelled = false;
    const run = async () => {
      try {
        if (active && !overlayOpen) {
          await syncBounds();
          if (!cancelled) await agentBrowserShow(label);
        } else {
          await agentBrowserHide(label);
        }
      } catch {
        /* ignore */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [active, label, native, overlayOpen, syncBounds]);

  // Keep bounds in sync with the host placeholder.
  useEffect(() => {
    if (!native || !url) return;
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      void syncBounds();
    });
    observer.observe(host);

    const onWindowResize = () => {
      void syncBounds();
    };
    window.addEventListener("resize", onWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [native, url, syncBounds]);

  // Native load / title events.
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    void (async () => {
      const unLoad = await listenAgentBrowserLoad((payload) => {
        if (disposed || payload.label !== label) return;
        setLoading(payload.loading);
        if (payload.loading) return;
        if (!payload.url || payload.url === "about:blank") return;
        // Update chrome only — do not set `url` or redirects re-trigger navigate.
        setDraft(payload.url);
        urlRef.current = payload.url;
        setCanGoBack(true);
        setCanGoForward(true);
        onUrlChangeRef.current?.(payload.url, hostLabel(payload.url));
      });
      const unTitle = await listenAgentBrowserTitle((payload) => {
        if (disposed || payload.label !== label) return;
        const currentUrl = urlRef.current;
        if (!currentUrl) return;
        onUrlChangeRef.current?.(
          currentUrl,
          payload.title || hostLabel(currentUrl),
        );
      });
      if (disposed) {
        unLoad();
        unTitle();
        return;
      }
      unlisteners.push(unLoad, unTitle);
    })();

    return () => {
      disposed = true;
      for (const un of unlisteners) un();
    };
  }, [native, label]);

  // Destroy native webview on unmount.
  useEffect(() => {
    return () => {
      if (!native || !createdRef.current) return;
      createdRef.current = false;
      void agentBrowserDestroy(label);
    };
  }, [label, native]);

  const navigate = useCallback(
    (raw: string) => {
      const next = normalizeBrowserUrl(raw);
      if (!next) return;
      setUrl(next);
      setDraft(next);
      setLoading(true);
      onUrlChangeRef.current?.(next, hostLabel(next));
    },
    [],
  );

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    navigate(draft);
  };

  if (!url) {
    return (
      <div className="agent-surface-pane agent-surface-pane--browser">
        <div className="agent-surface-browser-empty">
          <Globe size={20} aria-hidden strokeWidth={1.6} />
          <h3>No preview yet</h3>
          <p>
            Type a URL below, or open a local dev server (e.g. localhost:5173).
          </p>
          <form className="agent-surface-browser-empty__form" onSubmit={submit}>
            <input
              ref={urlInputRef}
              type="text"
              className="agent-surface-browser-url"
              value={draft}
              placeholder="https://google.com"
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              aria-label="URL"
              {...{ [AGENT_SURFACE_FOCUS_ATTR]: AGENT_SURFACE_FOCUS.browserAddress }}
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
            disabled={!canGoBack || !native}
            aria-label="Back"
            onClick={() => {
              if (!native || !createdRef.current) return;
              setLoading(true);
              void agentBrowserGoBack(label);
            }}
          >
            <ArrowLeft size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="agent-surface-browser-nav-btn"
            disabled={!canGoForward || !native}
            aria-label="Forward"
            onClick={() => {
              if (!native || !createdRef.current) return;
              setLoading(true);
              void agentBrowserGoForward(label);
            }}
          >
            <ArrowRight size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="agent-surface-browser-nav-btn"
            aria-label="Refresh"
            onClick={() => {
              setLoading(true);
              if (native && createdRef.current) {
                void agentBrowserReload(label);
              }
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
          ref={urlInputRef}
          type="text"
          className="agent-surface-browser-url"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="URL"
          title="Address (⌘L)"
          {...{ [AGENT_SURFACE_FOCUS_ATTR]: AGENT_SURFACE_FOCUS.browserAddress }}
        />
        <button
          type="button"
          className="agent-surface-browser-nav-btn"
          aria-label="Open in system browser"
          title="Open in system browser"
          onClick={() => void openExternal(draft || url)}
        >
          <ExternalLink size={14} aria-hidden />
        </button>
      </form>
      {error ? (
        <p className="agent-surface-browser-error" role="alert">
          {error}
        </p>
      ) : null}
      <div
        ref={hostRef}
        className="agent-surface-browser-frame"
        data-agent-browser-host={label}
        aria-label="Browser preview"
      />
    </div>
  );
}
