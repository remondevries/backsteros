import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { isTauriRuntime } from "../whoop";

export const AGENT_BROWSER_LOAD_EVENT = "agent-browser:load";
export const AGENT_BROWSER_TITLE_EVENT = "agent-browser:title";

export type AgentBrowserLoadPayload = {
  label: string;
  url: string;
  loading: boolean;
};

export type AgentBrowserTitlePayload = {
  label: string;
  title: string;
};

export type AgentBrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Stable Tauri webview label for an agent-surface browser tab. */
export function agentBrowserLabel(tabId: string): string {
  return `agent-browser-${tabId}`;
}

export function isAgentBrowserAvailable(): boolean {
  return isTauriRuntime();
}

export async function agentBrowserCreate(
  label: string,
  url: string,
  bounds: AgentBrowserBounds,
): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("agent_browser_create", {
    label,
    url,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
}

export async function agentBrowserSetBounds(
  label: string,
  bounds: AgentBrowserBounds,
): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("agent_browser_set_bounds", {
    label,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
}

export async function agentBrowserShow(label: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("agent_browser_show", { label });
}

export async function agentBrowserHide(label: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("agent_browser_hide", { label });
}

export async function agentBrowserDestroy(label: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("agent_browser_destroy", { label });
}

export async function agentBrowserNavigate(
  label: string,
  url: string,
): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("agent_browser_navigate", { label, url });
}

export async function agentBrowserReload(label: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("agent_browser_reload", { label });
}

export async function agentBrowserGoBack(label: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("agent_browser_go_back", { label });
}

export async function agentBrowserGoForward(label: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("agent_browser_go_forward", { label });
}

export async function listenAgentBrowserLoad(
  handler: (payload: AgentBrowserLoadPayload) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<AgentBrowserLoadPayload>(AGENT_BROWSER_LOAD_EVENT, (event) => {
    handler(event.payload);
  });
}

export async function listenAgentBrowserTitle(
  handler: (payload: AgentBrowserTitlePayload) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<AgentBrowserTitlePayload>(
    AGENT_BROWSER_TITLE_EVENT,
    (event) => {
      handler(event.payload);
    },
  );
}

export function readElementBounds(element: HTMLElement): AgentBrowserBounds {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}
