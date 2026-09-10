import { useAtomValue } from "@effect/atom-react";
import * as Schema from "effect/Schema";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { isElectron } from "../env";
import { getLocalStorageItem, removeLocalStorageItem } from "../hooks/useLocalStorage";
import {
  isBareKeyShortcutBlockedByEditable,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../keybindings";
import { isMacPlatform } from "../lib/utils";
import { primaryServerKeybindingsAtom } from "../state/server";
import { useLegacySidebarEnabled } from "../hooks/useSettings";
import { usePanelAnimationSettings } from "../panelAnimations";
import LegacyThreadSidebar from "./LegacySidebar";
import ThreadSidebar from "./Sidebar";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import { SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { ServersPageSidebar } from "./servers/ServersPageSidebar";
import { PullRequestsPageSidebar } from "./pullRequest/PullRequestsPageSidebar";
import { UsagePageSidebar } from "./usage/UsagePageSidebar";
import { BacksterosTaskDetailPanel } from "./sidebar/BacksterosTaskDetailPanel";
import { BacksterosComposeModal } from "./sidebar/BacksterosCreateTaskForm";
import { useProjects } from "../state/entities";
import { useBacksterosTaskDetailUiStore } from "../backsteros/taskDetailUiStore";

import {
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./threadSidebarWidth";
import {
  Sidebar,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
  useSidebarVisibility,
} from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "90px";

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

function readInitialThreadSidebarWidth(): number {
  try {
    return resolveInitialThreadSidebarWidth(
      getLocalStorageItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY, Schema.Finite),
      window.innerWidth,
    );
  } catch (error) {
    console.error("Could not read persisted thread sidebar width.", error);
    return resolveInitialThreadSidebarWidth(null, window.innerWidth);
  }
}

function SidebarControl() {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { toggleSidebar } = useSidebar();
  const isSidebarVisible = useSidebarVisibility();
  const toggleTaskDetail = useBacksterosTaskDetailUiStore((state) => state.toggleTaskDetail);
  const shortcutLabel = shortcutLabelForCommand(keybindings, "sidebar.toggle");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-keybinding-capture]")
      ) {
        return;
      }
      // Bare `[` / `⇧[` / `]` must not steal characters from editors / inputs.
      if (isBareKeyShortcutBlockedByEditable(event)) return;

      const command = resolveShortcutCommand(event, keybindings);
      if (command === "sidebar.toggle") {
        event.preventDefault();
        event.stopPropagation();
        toggleSidebar();
        return;
      }
      if (command === "taskDetail.toggle") {
        event.preventDefault();
        event.stopPropagation();
        toggleTaskDetail();
      }
    };

    // Capture so bracket chords win before the composer treats them as text
    // (same approach as the old Mod+B sidebar toggle) — but only when not typing.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keybindings, toggleSidebar, toggleTaskDetail]);

  return (
    // Shown only while the sidebar is collapsed — when open, the trigger lives
    // in the sidebar titlebar (right side, clear of traffic lights).
    !isSidebarVisible ? (
      <div
        className="pointer-events-none fixed left-[var(--workspace-controls-left)] top-[var(--workspace-controls-top)] z-50 ml-px flex h-[var(--workspace-topbar-height)] items-center"
        data-sidebar-control=""
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarTrigger className="pointer-events-auto" aria-label="Toggle main sidebar" />
            }
          />
          <TooltipPopup side="bottom">
            Toggle main sidebar{shortcutLabel ? ` (${shortcutLabel})` : ""}
          </TooltipPopup>
        </Tooltip>
      </div>
    ) : null
  );
}

// Settings swaps the thread sidebar out of the tree. Keep the lightweight
// project projection subscribed so returning to a draft never renders the
// zero-project state while the environment snapshot reconnects.
function ProjectProjectionRetention() {
  useProjects();
  return null;
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const legacySidebarEnabled = useLegacySidebarEnabled();
  const { active: panelAnimationsActive, durationMs: panelAnimationDurationMs } =
    usePanelAnimationSettings();
  // Settings / Usage / Pull Requests / Servers swap the thread sidebar out of the tree.
  const pathname = useLocation({ select: (location) => location.pathname });
  const isOnSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  const isOnServersPage = pathname === "/servers" || pathname.startsWith("/servers/");
  const isOnPullRequestsPage =
    pathname === "/pull-requests" || pathname.startsWith("/pull-requests/");
  const isOnUsagePage = pathname === "/usage" || pathname.startsWith("/usage/");
  const replacesThreadSidebar =
    isOnSettings || isOnUsagePage || isOnServersPage || isOnPullRequestsPage;
  const taskDetailSelection = useBacksterosTaskDetailUiStore((state) => state.selection);
  const taskDetailVisible = useBacksterosTaskDetailUiStore((state) => state.visible);
  const clearTaskDetail = useBacksterosTaskDetailUiStore((state) => state.clearTaskDetail);
  const isMacosDesktop = isElectron && isMacPlatform(navigator.platform);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialThreadSidebarWidth);
  // Subscribed rather than read once: the clamp must track live window size,
  // and a clamped drag ends with an unchanged width, which skips the re-render
  // that would otherwise refresh a render-time snapshot.
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  const sidebarMaximumWidth = resolveThreadSidebarMaximumWidth(viewportWidth);
  const resetSidebarWidth = () => {
    try {
      removeLocalStorageItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY);
    } catch (error) {
      console.error("Could not clear persisted thread sidebar width.", error);
    }
    setSidebarWidth(resolveInitialThreadSidebarWidth(null, viewportWidth));
  };
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(() => {
    const getWindowFullscreenState = window.desktopBridge?.getWindowFullscreenState;
    return isMacosDesktop && typeof getWindowFullscreenState === "function"
      ? getWindowFullscreenState()
      : false;
  });
  const sidebarProviderStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--panel-animation-duration": `${panelAnimationDurationMs}ms`,
    ...(isMacosDesktop && !isWindowFullscreen
      ? { "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET }
      : {}),
  } as CSSProperties;

  useEffect(() => {
    if (!isMacosDesktop) return;
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const { getWindowFullscreenState, onWindowFullscreenStateChange } = bridge;
    if (
      typeof getWindowFullscreenState !== "function" ||
      typeof onWindowFullscreenStateChange !== "function"
    ) {
      return;
    }

    const unsubscribe = onWindowFullscreenStateChange(setIsWindowFullscreen);
    setIsWindowFullscreen(getWindowFullscreenState());
    return unsubscribe;
  }, [isMacosDesktop]);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        const isSettingsRoute = /^\/settings(\/|$)/.test(pathname);
        if (!isSettingsRoute) {
          void navigate({ to: "/settings" });
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate, pathname]);

  useEffect(() => {
    // Keep compose available on Servers; only clear open task detail when leaving threads.
    if (replacesThreadSidebar) clearTaskDetail();
  }, [clearTaskDetail, replacesThreadSidebar]);

  return (
    <SidebarProvider
      className="h-dvh! min-h-0!"
      data-panel-animations={panelAnimationsActive ? "true" : "false"}
      {...(taskDetailSelection && taskDetailVisible ? { "data-task-detail-open": "true" } : {})}
      defaultOpen
      style={sidebarProviderStyle}
    >
      <ProjectProjectionRetention />
      <Sidebar
        side="left"
        collapsible="offcanvas"
        data-app-sidebar=""
        className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
        resizable={{
          maxWidth: sidebarMaximumWidth,
          minWidth: THREAD_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
            nextWidth <= currentWidth ||
            wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
          storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
          onResize: setSidebarWidth,
        }}
      >
        {isOnServersPage ? (
          <ServersPageSidebar />
        ) : isOnPullRequestsPage ? (
          <PullRequestsPageSidebar />
        ) : isOnUsagePage ? (
          <UsagePageSidebar />
        ) : isOnSettings ? (
          <>
            <SidebarChromeHeader isElectron={isElectron} />
            <SettingsSidebarNav pathname={pathname} />
          </>
        ) : legacySidebarEnabled ? (
          <LegacyThreadSidebar />
        ) : (
          <ThreadSidebar />
        )}
        <SidebarRail onDoubleClick={resetSidebarWidth} />
      </Sidebar>
      {!replacesThreadSidebar && taskDetailSelection && taskDetailVisible ? (
        <BacksterosTaskDetailPanel />
      ) : null}
      {!replacesThreadSidebar || isOnServersPage ? <BacksterosComposeModal /> : null}
      {children}
      <SidebarControl />
    </SidebarProvider>
  );
}
