import { ContentTabsTimer, useTabShortcuts } from "@backsteros/ui";
import { TrackedTimerProvider } from "@backsteros/ui/shell";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  BRIDGE_CHANNEL,
  type DesignDashboardSession,
  type DesignTab,
  type ShellToSpaMessage,
  isSpaToShellMessage,
  loadPersistedTabs,
  MAX_TABS,
  penpotFrameSrc,
  persistTabs,
  resolvePenpotPublicUri,
} from "./bridge";
import { SyncRemoteRunningTimers } from "./sync-remote-running-timers";

/** Synthetic id for the pinned dashboard slot in the tab cycle. */
const DASHBOARD_TAB_ID = "__dashboard__";

/*
 * Chrome is 48px (12 gutter + 36 band); 30px pills sit in the band
 * (visual center ≈ 30). Same inset as BacksterOS: y is top-of-dot offset
 * (`trafficLightPosition.y: 24` → center ~30).
 */
const TRAFFIC_LIGHT = { x: 16, y: 24 };

function PlusIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path
        d="M6 2.5V9.5M2.5 6H9.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

async function postToSpa(message: ShellToSpaMessage): Promise<void> {
  if (isTauri()) {
    await invoke("design_post_message", { message });
    return;
  }
  // Browser preview fallback (Penpot blocks cross-origin iframes).
  const frame = document.querySelector<HTMLIFrameElement>("#penpot-frame");
  frame?.contentWindow?.postMessage(message, "*");
}

function upsertTab(
  tabs: DesignTab[],
  next: Omit<DesignTab, "openedAt"> & { openedAt?: number },
  opts?: { replaceLocation?: boolean },
): DesignTab[] {
  const replaceLocation = opts?.replaceLocation === true;
  const existing = tabs.find((t) => t.fileId === next.fileId);
  if (existing) {
    return tabs.map((t) =>
      t.fileId === next.fileId
        ? {
            ...t,
            name: next.name || t.name,
            teamId: next.teamId ?? t.teamId,
            pageId: replaceLocation
              ? next.pageId
              : (next.pageId ?? t.pageId),
            boardId: replaceLocation
              ? next.boardId
              : (next.boardId ?? t.boardId),
          }
        : t,
    );
  }

  const tab: DesignTab = {
    fileId: next.fileId,
    name: next.name || "Untitled",
    teamId: next.teamId,
    pageId: next.pageId,
    boardId: next.boardId,
    openedAt: next.openedAt ?? Date.now(),
  };

  let result = [...tabs, tab];
  if (result.length > MAX_TABS) {
    const inactive = result
      .filter((t) => t.fileId !== tab.fileId)
      .sort((a, b) => a.openedAt - b.openedAt);
    const dropId = inactive[0]?.fileId;
    if (dropId) {
      result = result.filter((t) => t.fileId !== dropId);
    }
  }
  return result;
}

export default function App() {
  const penpotUri = useMemo(() => resolvePenpotPublicUri(), []);
  const frameSrc = useMemo(() => penpotFrameSrc(penpotUri), [penpotUri]);
  const inTauri = isTauri();

  const initial = useMemo(() => loadPersistedTabs(), []);
  const [tabs, setTabs] = useState<DesignTab[]>(initial.tabs);
  const [activeFileId, setActiveFileId] = useState<string | null>(
    initial.activeFileId,
  );
  const [dashboard, setDashboard] = useState<DesignDashboardSession | null>(
    initial.dashboard,
  );
  const [designReady, setDesignReady] = useState(!inTauri);
  const [status, setStatus] = useState(
    inTauri ? `Loading Penpot at ${penpotUri}…` : null,
  );
  const [quitHint, setQuitHint] = useState<string | null>(null);
  /** Auth screens have no dashboard or tabs. Hidden until a signed-in route. */
  const [signedIn, setSignedIn] = useState(false);
  /** Cold-start SPA restore runs once after the SPA posts a real route. */
  const sessionRestoredRef = useRef(false);
  const shellAckedRef = useRef(false);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeFileIdRef = useRef(activeFileId);
  activeFileIdRef.current = activeFileId;
  const dashboardRef = useRef(dashboard);
  dashboardRef.current = dashboard;

  useEffect(() => {
    persistTabs(tabs, activeFileId, dashboard);
  }, [tabs, activeFileId, dashboard]);

  useEffect(() => {
    if (!inTauri) return;
    const placeTrafficLights = () =>
      invoke("set_traffic_light_position", TRAFFIC_LIGHT).catch(() => {});
    void placeTrafficLights();
    void invoke<string>("mount_design_webview")
      .then((uri) => {
        setDesignReady(true);
        setStatus(null);
        // Layout/mount can reset AppKit buttons — place again after mount.
        void placeTrafficLights();
        void postToSpa({ channel: BRIDGE_CHANNEL, type: "shell-ready" });
        console.info("[BacksterDESIGN] design webview mounted →", uri);
      })
      .catch((err: unknown) => {
        setStatus(
          `Could not mount Penpot webview: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }, [inTauri]);

  useEffect(() => {
    if (!inTauri) return;
    let open = false;
    let lastKey = "";
    const sync = () => {
      const menu = document.querySelector(".content-tabs-timer__dropdown");
      if (!(menu instanceof HTMLElement)) {
        if (!open) return;
        open = false;
        lastKey = "";
        void invoke("set_timer_menu_overlay", { open: false }).catch(() => {});
        return;
      }
      const rect = menu.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const key = [
        rect.left.toFixed(1),
        rect.top.toFixed(1),
        rect.width.toFixed(1),
        rect.height.toFixed(1),
      ].join(":");
      if (open && key === lastKey) return;
      open = true;
      lastKey = key;
      void invoke("set_timer_menu_overlay", {
        open: true,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      }).catch(() => {});
    };
    const observer = new MutationObserver(() => {
      sync();
      window.requestAnimationFrame(sync);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      void invoke("set_timer_menu_overlay", { open: false }).catch(() => {});
    };
  }, [inTauri]);

  const closeActiveTabRef = useRef<(() => void) | null>(null);
  const handleSpaMessageRef = useRef<(data: unknown) => void>(() => {});

  useEffect(() => {
    if (!inTauri) return;
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    let quitHintTimer: ReturnType<typeof setTimeout> | null = null;

    void listen<string>("bd-design-ready", () => {
      if (cancelled) return;
      setDesignReady(true);
      setStatus(null);
      void postToSpa({ channel: BRIDGE_CHANNEL, type: "shell-ready" });
    }).then((u) => unsubs.push(u));

    void listen<unknown>("bd-from-spa", (event) => {
      if (cancelled) return;
      handleSpaMessageRef.current(event.payload);
    }).then((u) => unsubs.push(u));

    void listen("bd-close-active-tab", () => {
      if (cancelled) return;
      closeActiveTabRef.current?.();
    }).then((u) => unsubs.push(u));

    void listen("bd-quit-armed", () => {
      if (cancelled) return;
      setQuitHint("Press ⌘Q again to quit");
      if (quitHintTimer) clearTimeout(quitHintTimer);
      quitHintTimer = setTimeout(() => {
        if (!cancelled) setQuitHint(null);
      }, 1500);
    }).then((u) => unsubs.push(u));

    return () => {
      cancelled = true;
      if (quitHintTimer) clearTimeout(quitHintTimer);
      for (const u of unsubs) u();
    };
  }, [inTauri]);

  const hasPersistedSession = useCallback(() => {
    return (
      activeFileIdRef.current != null ||
      tabsRef.current.length > 0 ||
      dashboardRef.current != null
    );
  }, []);

  /** Returns true when a restore navigation was posted (caller should skip default). */
  const restoreSessionToSpa = useCallback((): boolean => {
    if (!hasPersistedSession()) return false;

    const currentTabs = tabsRef.current;
    const currentActive = activeFileIdRef.current;
    const currentDashboard = dashboardRef.current;

    if (currentActive) {
      const tab = currentTabs.find((t) => t.fileId === currentActive);
      if (tab) {
        void postToSpa({
          channel: BRIDGE_CHANNEL,
          type: "focus-tab",
          fileId: tab.fileId,
          teamId: tab.teamId,
          pageId: tab.pageId,
          boardId: tab.boardId,
        });
        return true;
      }
    }

    void postToSpa({
      channel: BRIDGE_CHANNEL,
      type: "go-dashboard",
      teamId: currentDashboard?.params["team-id"],
      routeName: currentDashboard?.name,
      params: currentDashboard?.params,
    });
    return true;
  }, [hasPersistedSession]);

  const handleSpaMessage = useCallback((data: unknown) => {
    if (!isSpaToShellMessage(data)) return;
    const msg = data;

    if (msg.type === "spa-ready") {
      setDesignReady(true);
      setStatus(null);
      // Ack desktop mode once. Session restore waits for a real post-auth route.
      if (shellAckedRef.current) return;
      shellAckedRef.current = true;
      void postToSpa({ channel: BRIDGE_CHANNEL, type: "shell-ready" });
      return;
    }

    if (msg.type === "close-active-tab") {
      closeActiveTabRef.current?.();
      return;
    }

    if (msg.type === "tab-upsert") {
      // Cold start: rehydrate before adopting the SPA's boot upsert.
      if (!sessionRestoredRef.current) {
        sessionRestoredRef.current = true;
        if (restoreSessionToSpa()) return;
      }
      setTabs((prev) =>
        upsertTab(
          prev,
          {
            fileId: msg.fileId,
            name: msg.name,
            teamId: msg.teamId,
            pageId: msg.pageId,
            boardId: msg.boardId,
          },
          { replaceLocation: true },
        ),
      );
      setActiveFileId(msg.fileId);
      return;
    }

    if (msg.type === "tab-title") {
      setTabs((prev) =>
        prev.map((t) =>
          t.fileId === msg.fileId ? { ...t, name: msg.name } : t,
        ),
      );
      return;
    }

    if (msg.type === "route-changed") {
      if (msg.authenticated === false || msg.route === "auth") {
        setSignedIn(false);
      } else if (
        msg.authenticated === true ||
        msg.route === "dashboard" ||
        msg.route === "workspace"
      ) {
        setSignedIn(true);
      }

      // Router is live (post-auth). Rehydrate once, keep persisted chrome.
      if (
        !sessionRestoredRef.current &&
        (msg.route === "dashboard" || msg.route === "workspace")
      ) {
        sessionRestoredRef.current = true;
        if (restoreSessionToSpa()) return;
      }

      if (msg.route === "workspace" && msg.fileId) {
        setActiveFileId(msg.fileId);
        setTabs((prev) => {
          if (prev.some((t) => t.fileId === msg.fileId)) {
            return upsertTab(
              prev,
              {
                fileId: msg.fileId!,
                name: "",
                teamId: msg.teamId,
                pageId: msg.pageId,
                boardId: msg.boardId,
              },
              { replaceLocation: true },
            );
          }
          return upsertTab(prev, {
            fileId: msg.fileId!,
            name: "Untitled",
            teamId: msg.teamId,
            pageId: msg.pageId,
            boardId: msg.boardId,
          });
        });
      } else if (msg.route === "dashboard") {
        setActiveFileId(null);
        if (msg.dashboardName) {
          setDashboard({
            name: msg.dashboardName,
            params: msg.dashboardParams ?? {},
          });
        }
      }
      return;
    }

    if (msg.type === "cycle-tabs") {
      cycleTabsRef.current?.(msg.direction);
      return;
    }

    if (msg.type === "focus-tab-index") {
      focusTabAtIndexRef.current?.(msg.index);
      return;
    }

    if (msg.type === "timer-focus" && msg.taskId) {
      setDashboard((prev) =>
        prev
          ? { ...prev, params: { ...prev.params, "task-id": msg.taskId! } }
          : { name: "dashboard-files", params: { "task-id": msg.taskId! } },
      );
    }
  }, [restoreSessionToSpa]);

  handleSpaMessageRef.current = handleSpaMessage;

  const cycleTabsRef = useRef<
    ((direction: "previous" | "next") => void) | null
  >(null);
  const focusTabAtIndexRef = useRef<((index: number) => void) | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => handleSpaMessage(event.data);
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleSpaMessage]);

  const focusTab = useCallback((tab: DesignTab) => {
    setActiveFileId(tab.fileId);
    setTabs((prev) =>
      prev.map((t) =>
        t.fileId === tab.fileId ? { ...t, openedAt: Date.now() } : t,
      ),
    );
    void postToSpa({
      channel: BRIDGE_CHANNEL,
      type: "focus-tab",
      fileId: tab.fileId,
      teamId: tab.teamId,
      pageId: tab.pageId,
      boardId: tab.boardId,
    });
  }, []);

  const closeTab = useCallback(
    (fileId: string, ev?: MouseEvent) => {
      ev?.stopPropagation();
      const remaining = tabs.filter((t) => t.fileId !== fileId);
      const wasActive = activeFileId === fileId;
      setTabs(remaining);

      void postToSpa({
        channel: BRIDGE_CHANNEL,
        type: "close-tab",
        fileId,
      });

      if (!wasActive) return;

      const next = remaining[remaining.length - 1] ?? null;
      setActiveFileId(next?.fileId ?? null);
      if (next) {
        void postToSpa({
          channel: BRIDGE_CHANNEL,
          type: "focus-tab",
          fileId: next.fileId,
          teamId: next.teamId,
          pageId: next.pageId,
          boardId: next.boardId,
        });
      } else {
        void postToSpa({
          channel: BRIDGE_CHANNEL,
          type: "go-dashboard",
        });
      }
    },
    [activeFileId, tabs],
  );

  const closeActiveTab = useCallback(() => {
    if (!activeFileId) return;
    closeTab(activeFileId);
  }, [activeFileId, closeTab]);

  closeActiveTabRef.current = closeActiveTab;

  const goDashboard = useCallback(() => {
    setActiveFileId(null);
    const remembered = dashboardRef.current;
    void postToSpa({
      channel: BRIDGE_CHANNEL,
      type: "go-dashboard",
      teamId: remembered?.params["team-id"],
      routeName: remembered?.name,
      params: remembered?.params,
    });
  }, []);

  const focusTabRef = useRef(focusTab);
  focusTabRef.current = focusTab;
  const goDashboardRef = useRef(goDashboard);
  goDashboardRef.current = goDashboard;

  /** Cycle: pinned dashboard + open file tabs (⌘⇧[ / ⌘⇧]). */
  const cycleTabs = useCallback((direction: "previous" | "next") => {
    const currentTabs = tabsRef.current;
    const currentActive = activeFileIdRef.current;
    const ids = [DASHBOARD_TAB_ID, ...currentTabs.map((t) => t.fileId)];
    if (ids.length <= 1) return;
    const currentId = currentActive ?? DASHBOARD_TAB_ID;
    const index = ids.indexOf(currentId);
    const start = index >= 0 ? index : 0;
    const step = direction === "previous" ? -1 : 1;
    const nextId = ids[(start + step + ids.length) % ids.length]!;
    if (nextId === DASHBOARD_TAB_ID) {
      goDashboardRef.current();
      return;
    }
    const tab = currentTabs.find((t) => t.fileId === nextId);
    if (tab) focusTabRef.current(tab);
  }, []);

  const activatePreviousTab = useCallback(() => {
    cycleTabs("previous");
  }, [cycleTabs]);

  const activateNextTab = useCallback(() => {
    cycleTabs("next");
  }, [cycleTabs]);

  /** ⌘1 = dashboard, ⌘2 = first file tab, … */
  const focusTabAtIndex = useCallback((index: number) => {
    if (!Number.isInteger(index) || index < 0) return;
    const currentTabs = tabsRef.current;
    if (index === 0) {
      goDashboardRef.current();
      return;
    }
    const tab = currentTabs[index - 1];
    if (tab) focusTabRef.current(tab);
  }, []);

  cycleTabsRef.current = cycleTabs;
  focusTabAtIndexRef.current = focusTabAtIndex;

  // Shell-side shortcuts (when chrome has focus). SPA also forwards when the
  // Penpot webview owns the keyboard — see desktop.cljs.
  useTabShortcuts({
    enabled: true,
    activeTabId: activeFileId ?? DASHBOARD_TAB_ID,
    openNewTab: goDashboard,
    closeTab: (tabId) => {
      if (tabId === DASHBOARD_TAB_ID) return;
      closeTab(tabId);
    },
    activatePreviousTab,
    activateNextTab,
  });

  // ⌘1–⌘9 jump to tab by index (dashboard + file tabs).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      const match = /^Digit([1-9])$/.exec(event.code);
      const fromKey =
        match?.[1] ?? (/^[1-9]$/.test(event.key) ? event.key : null);
      if (fromKey == null) return;
      event.preventDefault();
      event.stopPropagation();
      focusTabAtIndex(Number(fromKey) - 1);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [focusTabAtIndex]);

  const onDashboard = activeFileId === null;

  return (
    <TrackedTimerProvider
      onNavigate={(href) => {
        if (!href.startsWith("/") || href.startsWith("//")) return;
        if (isTauri()) {
          void invoke("open_backsteros_href", { href }).catch(() => {});
          return;
        }
        window.open(href, "_blank", "noopener");
      }}
    >
      <SyncRemoteRunningTimers
        taskId={
          dashboard?.params["task-id"] ||
          dashboard?.params.taskId ||
          null
        }
      />
      <div className="shell">
      <header className="chrome" data-tauri-drag-region>
        {signedIn && (
        <button
          type="button"
          className={`chrome__home${onDashboard ? " is-active" : ""}`}
          aria-label="Dashboard"
          title="Dashboard"
          data-tauri-drag-region="false"
          onClick={goDashboard}
        >
          <img
            className="chrome__home-logo"
            src="./logo-small.svg"
            alt=""
            width={18}
            height={18}
            draggable={false}
          />
        </button>
        )}

        <div className="content-tabs-scroll">
          <div
            className="content-tabs-list"
            role="tablist"
            aria-label="Open files"
          >
            {tabs.map((tab) => {
              const isActive = tab.fileId === activeFileId;
              return (
                <span
                  key={tab.fileId}
                  role="tab"
                  tabIndex={-1}
                  aria-selected={isActive}
                  title={tab.name}
                  className={[
                    "content-tab",
                    isActive ? "content-tab-active" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-tauri-drag-region="false"
                  onClick={() => focusTab(tab)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      focusTab(tab);
                    }
                  }}
                >
                  <span className="content-tab-content">
                    <span className="content-tab-label">{tab.name}</span>
                  </span>
                  <span className="content-tab-close-fade" aria-hidden="true" />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="content-tab-close"
                    aria-label={`Close ${tab.name}`}
                    title={`Close ${tab.name}`}
                    data-tauri-drag-region="false"
                    onClick={(e) => closeTab(tab.fileId, e)}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>

          {signedIn && (
          <button
            type="button"
            className="content-tab-add"
            aria-label="Go to dashboard"
            title="Go to dashboard"
            data-tauri-drag-region="false"
            onClick={goDashboard}
          >
            <PlusIcon />
          </button>
          )}
        </div>

        <ContentTabsTimer />
        {quitHint && <div className="quit-hint">{quitHint}</div>}
      </header>

      {/*
        Content frame (BacksterOS-style). In Tauri the Penpot SPA is a native
        child webview laid out over this slot; the chrome paints the border /
        radius / gutter. Browser preview uses an iframe inside the same frame.
      */}
      {inTauri ? (
        <>
          <div className="content-frame" aria-hidden />
          {status && (
            <div className="frame-status" style={{ position: "fixed", inset: 0 }}>
              {status}
            </div>
          )}
        </>
      ) : (
        <div className="frame-wrap">
          {status && <div className="frame-status">{status}</div>}
          {!designReady && (
            <div className="frame-status">
              Browser preview cannot embed Penpot (X-Frame-Options). Use{" "}
              <strong>pnpm tauri:dev</strong> instead.
              <br />
              Target: <strong>{penpotUri}</strong>
            </div>
          )}
          <iframe
            id="penpot-frame"
            className="frame"
            title="BacksterDESIGN"
            src={frameSrc}
            allow="clipboard-read; clipboard-write; fullscreen"
            onLoad={() => setDesignReady(true)}
          />
        </div>
      )}
    </div>
    </TrackedTimerProvider>
  );
}
