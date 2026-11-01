/**
 * Shared agent roster for shell chat, lead picker, and Settings.
 *
 * Prefer local-core (instant after agents twin), then refresh from the cloud
 * agents door so webhook URL / secretConfigured stay authoritative for chat.
 *
 * Webhook URL + secret ciphertext are cloud-only (not twin'd). After a Settings
 * Test, verifiedAt can land on local via replication while URL/secret stay
 * absent locally — never replace a cloud-enriched snapshot with local-only rows.
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

/**
 * Overlay `right` onto `left`, keeping the stronger webhook credential fields
 * from either side (URL / secretConfigured / verifiedAt are often split across
 * local twin vs cloud door).
 */
export function mergeAgentWebhookFields(left: Agent, right: Agent): Agent {
  return {
    ...left,
    ...right,
    webhookUrl: right.webhookUrl?.trim() || left.webhookUrl?.trim() || null,
    webhookSecretConfigured:
      right.webhookSecretConfigured || left.webhookSecretConfigured,
    webhookVerifiedAt:
      right.webhookVerifiedAt?.trim() || left.webhookVerifiedAt?.trim() || null,
  };
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
    byId.set(
      agent.id,
      previous ? mergeAgentWebhookFields(previous, agent) : agent,
    );
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
  const previousAgents = snapshot.agents;

  if (localFetcher) {
    try {
      const body = await localFetcher();
      localAgents = sortAgentsForDisplay(
        body.agents.filter((agent) => agent.enabled),
      );
      sawLocal = true;
      // Keep prior cloud webhook URL/secret while local catches up (verifiedAt
      // twins without credentials). Avoid flashing an empty chat strip.
      const painted =
        previousAgents.length > 0
          ? mergeAgentRosters(localAgents, previousAgents)
          : localAgents;
      setSnapshot({
        agents: painted,
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
      // Keep coalesced local+previous webhook fields; do not wipe to local-only.
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

/**
 * Optimistic roster update after Settings → Test (URL/secret live on cloud;
 * verifiedAt may twin later without credentials on local).
 */
export function patchShellAgentRosterAgent(
  agentId: string,
  patch: {
    webhookUrl?: string | null;
    webhookSecretConfigured?: boolean;
    webhookVerifiedAt?: string | null;
  },
): void {
  const id = agentId.trim();
  if (!id) return;
  const agents = snapshot.agents.map((agent) => {
    if (agent.id !== id) return agent;
    return {
      ...agent,
      ...(patch.webhookUrl !== undefined
        ? { webhookUrl: patch.webhookUrl?.trim() || null }
        : {}),
      ...(patch.webhookSecretConfigured !== undefined
        ? { webhookSecretConfigured: patch.webhookSecretConfigured }
        : {}),
      ...(patch.webhookVerifiedAt !== undefined
        ? { webhookVerifiedAt: patch.webhookVerifiedAt }
        : {}),
    };
  });
  setSnapshot({
    agents: sortAgentsForDisplay(agents.filter((agent) => agent.enabled)),
  });
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
