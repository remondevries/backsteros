/** postMessage channel between the Tauri shell and the Penpot SPA iframe. */
export const BRIDGE_CHANNEL = "backsterdesign-desktop";

export const MAX_TABS = 8;

export type DesignTab = {
  fileId: string;
  name: string;
  teamId?: string;
  pageId?: string;
  /** Focus hint for board deep-links — not tab identity. */
  boardId?: string;
  openedAt: number;
};

/** Last dashboard section (files, libraries, …) for cold-start restore. */
export type DesignDashboardSession = {
  /** Penpot route name without the leading colon, e.g. `dashboard-files`. */
  name: string;
  params: Record<string, string>;
};

export type DesignSession = {
  tabs: DesignTab[];
  /** Active file tab, or `null` when the pinned dashboard is focused. */
  activeFileId: string | null;
  dashboard: DesignDashboardSession | null;
};

export type ShellToSpaMessage =
  | { channel: typeof BRIDGE_CHANNEL; type: "shell-ready" }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "open-file";
      fileId: string;
      teamId?: string;
      pageId?: string;
      boardId?: string;
      name?: string;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "focus-tab";
      fileId: string;
      teamId?: string;
      pageId?: string;
      boardId?: string;
    }
  | { channel: typeof BRIDGE_CHANNEL; type: "close-tab"; fileId: string }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "go-dashboard";
      teamId?: string;
      /** Seed SPA `*last-dashboard` on cold start (e.g. `dashboard-files`). */
      routeName?: string;
      params?: Record<string, string>;
    };

export type SpaToShellMessage =
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "tab-upsert";
      fileId: string;
      name: string;
      teamId?: string;
      pageId?: string;
      boardId?: string;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "tab-title";
      fileId: string;
      name: string;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "route-changed";
      route: "workspace" | "dashboard" | "auth" | "other";
      /** False on the login screen, even if the route key is still "other". */
      authenticated?: boolean;
      fileId?: string;
      teamId?: string;
      pageId?: string;
      boardId?: string;
      /** Present when `route === "dashboard"`. */
      dashboardName?: string;
      dashboardParams?: Record<string, string>;
    }
  | { channel: typeof BRIDGE_CHANNEL; type: "spa-ready" }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "cycle-tabs";
      direction: "previous" | "next";
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "focus-tab-index";
      /** 0 = pinned dashboard, 1 = first file tab, … (⌘1 → 0). */
      index: number;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      /** SPA ⌘W — close the active file tab (shell owns tab list). */
      type: "close-active-tab";
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      /** Open task in the project rail — header timer follows this task. */
      type: "timer-focus";
      taskId: string | null;
      title?: string | null;
      number?: number | null;
      projectKey?: string | null;
      status?: string | null;
      trackedDurationSeconds?: number | null;
    };

export function isSpaToShellMessage(data: unknown): data is SpaToShellMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as Record<string, unknown>;
  return msg.channel === BRIDGE_CHANNEL && typeof msg.type === "string";
}

const TABS_STORAGE_KEY = "backsterdesign.desktop.tabs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeTab(raw: unknown): DesignTab | null {
  if (!isRecord(raw) || typeof raw.fileId !== "string" || !raw.fileId) {
    return null;
  }
  return {
    fileId: raw.fileId,
    name: typeof raw.name === "string" && raw.name ? raw.name : "Untitled",
    teamId: typeof raw.teamId === "string" ? raw.teamId : undefined,
    pageId: typeof raw.pageId === "string" ? raw.pageId : undefined,
    boardId: typeof raw.boardId === "string" ? raw.boardId : undefined,
    openedAt: typeof raw.openedAt === "number" ? raw.openedAt : Date.now(),
  };
}

function sanitizeDashboard(raw: unknown): DesignDashboardSession | null {
  if (!isRecord(raw) || typeof raw.name !== "string" || !raw.name) {
    return null;
  }
  const params: Record<string, string> = {};
  if (isRecord(raw.params)) {
    for (const [key, value] of Object.entries(raw.params)) {
      if (typeof value === "string" && value) params[key] = value;
    }
  }
  if (!params["team-id"] && !params.teamId) return null;
  return { name: raw.name, params };
}

export function loadPersistedTabs(): DesignSession {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) {
      return { tabs: [], activeFileId: null, dashboard: null };
    }
    const parsed = JSON.parse(raw) as {
      tabs?: unknown[];
      activeFileId?: string | null;
      dashboard?: unknown;
    };
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs
          .map(sanitizeTab)
          .filter((t): t is DesignTab => t != null)
          .slice(0, MAX_TABS)
      : [];
    const activeFileId =
      typeof parsed.activeFileId === "string" &&
      tabs.some((t) => t.fileId === parsed.activeFileId)
        ? parsed.activeFileId
        : parsed.activeFileId === null
          ? null
          : (tabs[tabs.length - 1]?.fileId ?? null);
    return {
      tabs,
      activeFileId,
      dashboard: sanitizeDashboard(parsed.dashboard),
    };
  } catch {
    return { tabs: [], activeFileId: null, dashboard: null };
  }
}

export function persistTabs(
  tabs: DesignTab[],
  activeFileId: string | null,
  dashboard: DesignDashboardSession | null = null,
): void {
  try {
    localStorage.setItem(
      TABS_STORAGE_KEY,
      JSON.stringify({ tabs, activeFileId, dashboard }),
    );
  } catch {
    // quota / private mode — ignore
  }
}

/** Resolve the Penpot origin the iframe loads. Cookies stay first-party there. */
export function resolvePenpotPublicUri(): string {
  const fromEnv =
    import.meta.env.VITE_PENPOT_PUBLIC_URI ||
    import.meta.env.PENPOT_PUBLIC_URI ||
    "";
  const trimmed = fromEnv.trim().replace(/\/$/, "");
  return trimmed || "https://design.lemo-design.com";
}

export function penpotFrameSrc(baseUri: string): string {
  const url = new URL(baseUri.includes("://") ? baseUri : `https://${baseUri}`);
  url.searchParams.set("tauri-desktop", "1");
  return url.toString();
}
