import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";
import { randomUUID } from "~/lib/utils";

const STORAGE_KEY = "t3code:backsteros-file-task-agents";
const STORAGE_VERSION = 1;

/** Default assignee when Remon is driving BDV (from BDV-28 house rules). */
export const DEFAULT_FILE_TASK_ASSIGNEE_ID = "9c36dc9c-6e9e-4f21-a602-4f7291231e60";

export type BacksterosFileTaskAgent = {
  readonly id: string;
  readonly name: string;
  readonly webhookUrl: string;
  /** Pasted from Grok Bot routine; sent as Authorization (Bearer if bare token). */
  readonly webhookKey: string;
};

type FileTaskAgentsState = {
  readonly agents: readonly BacksterosFileTaskAgent[];
  /** Preferred agent for the file modal. */
  readonly selectedAgentId: string | null;
  /**
   * Optional Cloud Core / agents-door origin for the file-task mailbox.
   * Empty → `https://agent.backsteros.com`.
   */
  readonly callbackBaseUrl: string;
  readonly setAgents: (agents: readonly BacksterosFileTaskAgent[]) => void;
  readonly upsertAgent: (agent: BacksterosFileTaskAgent) => void;
  readonly removeAgent: (agentId: string) => void;
  readonly setSelectedAgentId: (agentId: string | null) => void;
  readonly setCallbackBaseUrl: (url: string) => void;
};

export const useBacksterosFileTaskAgentsStore = create<FileTaskAgentsState>()(
  persist(
    (set, get) => ({
      agents: [],
      selectedAgentId: null,
      callbackBaseUrl: "",
      setAgents: (agents) => set({ agents }),
      upsertAgent: (agent) => {
        const existing = get().agents;
        const index = existing.findIndex((entry) => entry.id === agent.id);
        const next =
          index >= 0
            ? existing.map((entry, i) => (i === index ? agent : entry))
            : [...existing, agent];
        set({
          agents: next,
          selectedAgentId: get().selectedAgentId ?? agent.id,
        });
      },
      removeAgent: (agentId) => {
        const next = get().agents.filter((entry) => entry.id !== agentId);
        const selected = get().selectedAgentId;
        set({
          agents: next,
          selectedAgentId: selected === agentId ? (next[0]?.id ?? null) : selected,
        });
      },
      setSelectedAgentId: (agentId) => set({ selectedAgentId: agentId }),
      setCallbackBaseUrl: (url) => set({ callbackBaseUrl: url.trim() }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        agents: state.agents,
        selectedAgentId: state.selectedAgentId,
        callbackBaseUrl: state.callbackBaseUrl,
      }),
    },
  ),
);

export function createEmptyFileTaskAgent(): BacksterosFileTaskAgent {
  return {
    id: randomUUID(),
    name: "",
    webhookUrl: "",
    webhookKey: "",
  };
}

export function readSelectedFileTaskAgent(): BacksterosFileTaskAgent | null {
  const { agents, selectedAgentId } = useBacksterosFileTaskAgentsStore.getState();
  if (selectedAgentId) {
    const selected = agents.find((agent) => agent.id === selectedAgentId);
    if (selected) return selected;
  }
  return agents[0] ?? null;
}

export const DEFAULT_FILE_TASK_MAILBOX_URL = "https://agent.backsteros.com";

/** Cloud Core door used to register and poll the file-task mailbox. */
export function resolveFileTaskMailboxBaseUrl(): string {
  const configured = useBacksterosFileTaskAgentsStore.getState().callbackBaseUrl.trim();
  return (configured || DEFAULT_FILE_TASK_MAILBOX_URL).replace(/\/$/, "");
}
