/**
 * Shared agent roster for shell chat, lead picker, and Settings.
 *
 * Prefer local-core (instant after agents twin), then refresh from the cloud
 * agents door so webhook URL / secretConfigured stay authoritative for chat.
 */
import type { Agent } from "@backsteros/contracts";

import {
  cloudCoreRequestJson,
  isCloudCoreApiError,
} from "./cloud-core-api";
import { sortAgentsForDisplay } from "./shell-agent-order";
import { SHELL_AGENT_ROSTER_CHANGED_EVENT } from "./shell-agent-roster";

export type ShellAgentRosterSnapshot = {
  agents: readonly Agent[];
  /** True until the first local or cloud response settles. */
  loading: boolean;
  error: string | null;
};

type LocalAgentsFetcher = () => Promise<{ agents: Agent[] }>;

type Listener = (snapshot: ShellAgentRosterSnapshot) => void;

let snapshot: ShellAgentRosterSnapshot = {
  agents: [],
  loading: true,
  error: null,
};
let inFlight: Promise<void> | null = null;
let localFetcher: LocalAgentsFetcher | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(snapshot);
}

function setSnapshot(next: Partial<ShellAgentRosterSnapshot>): void {
  snapshot = {
    agents: next.agents ?? snapshot.agents,
    loading: next.loading ?? snapshot.loading,
    error: next.error !== undefined ? next.error : snapshot.error,
  };
  emit();
}

/** Local paints first; cloud overlays webhook fields by id. */
export function mergeAgentRosters(
  local: readonly Agent[],
  cloud: readonly Agent[],
): Agent[] {
  const byId = new Map<string, Agent>();
  for (const agent of local) byId.set(agent.id, agent);
  for (const agent of cloud) {
    const previous = byId.get(agent.id);
    byId.set(agent.id, previous ? { ...previous, ...agent } : agent);
  }
  return sortAgentsForDisplay(
    [...byId.values()].filter((agent) => agent.enabled),
  );
}

function cloudLoadErrorMessage(error: unknown): string {
  if (isCloudCoreApiError(error) && error.status === 401) {
    return "Cloud chat needs an owner API key (Tauri reads ~/.config/backsteros/cli.env; Vite serve loads it automatically). Restart the dev server after updating the key.";
  }
  return "Could not load agents from cloud (agent.backsteros.com). Check the network and try again.";
}

async function loadOnce(): Promise<void> {
  let localAgents: Agent[] = [];
  let sawLocal = false;

  if (localFetcher) {
    try {
      const body = await localFetcher();
      localAgents = sortAgentsForDisplay(
        body.agents.filter((agent) => agent.enabled),
      );
      sawLocal = true;
      // Paint local roster immediately; keep loading until cloud merge so chat
      // does not flash the empty-webhook card before webhook fields arrive.
      setSnapshot({
        agents: localAgents,
        error: null,
      });
    } catch {
      // Local miss is fine — fall through to cloud.
    }
  }

  try {
    const cloudBody = await cloudCoreRequestJson<{ agents: Agent[] }>(
      "/api/v1/agents",
    );
    const cloudAgents = cloudBody.agents.filter((agent) => agent.enabled);
    const merged = mergeAgentRosters(localAgents, cloudAgents);
    setSnapshot({
      agents: merged,
      loading: false,
      error: null,
    });
  } catch (error) {
    if (sawLocal) {
      // Keep local roster; surface cloud error only when chat needs webhooks.
      setSnapshot({
        loading: false,
        error: cloudLoadErrorMessage(error),
      });
      return;
    }
    setSnapshot({
      agents: [],
      loading: false,
      error: cloudLoadErrorMessage(error),
    });
  }
}

export function getShellAgentRosterSnapshot(): ShellAgentRosterSnapshot {
  return snapshot;
}

/** Desktop registers local-core GET /api/v1/agents for instant roster. */
export function configureShellAgentRosterLocalFetcher(
  fetcher: LocalAgentsFetcher | null,
): void {
  localFetcher = fetcher;
}

let rosterChangedBound = false;

function ensureRosterChangedBinding(): void {
  if (rosterChangedBound || typeof window === "undefined") return;
  rosterChangedBound = true;
  window.addEventListener(SHELL_AGENT_ROSTER_CHANGED_EVENT, () => {
    refreshShellAgentRoster();
  });
}

export function subscribeShellAgentRoster(listener: Listener): () => void {
  ensureRosterChangedBinding();
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

/** Kick a load if none is in flight. Safe to call from every consumer. */
export function ensureShellAgentRosterLoaded(): void {
  if (inFlight) return;
  if (snapshot.agents.length === 0) {
    setSnapshot({ loading: true });
  }
  inFlight = loadOnce().finally(() => {
    inFlight = null;
  });
}

/** Force refresh (Settings save, roster-changed event). Keep current list painted. */
export function refreshShellAgentRoster(): void {
  const start = () => {
    inFlight = loadOnce().finally(() => {
      inFlight = null;
    });
  };
  if (inFlight) {
    void inFlight.then(start);
    return;
  }
  start();
}
