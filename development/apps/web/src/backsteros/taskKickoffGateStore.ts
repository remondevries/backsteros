import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

export type BacksterosTaskKickoffGateMode = "gate" | "advanced" | "pending-send";

export type BacksterosTaskKickoffGate = {
  readonly mode: BacksterosTaskKickoffGateMode;
  readonly kickoffPrompt: string;
};

interface BacksterosTaskKickoffGateStoreState {
  readonly byTaskId: Record<string, BacksterosTaskKickoffGate>;
  readonly setGate: (taskId: string, gate: BacksterosTaskKickoffGate) => void;
  readonly setKickoffPrompt: (taskId: string, kickoffPrompt: string) => void;
  readonly setMode: (taskId: string, mode: BacksterosTaskKickoffGateMode) => void;
  readonly clear: (taskId: string) => void;
  readonly getGate: (taskId: string) => BacksterosTaskKickoffGate | null;
}

const STORAGE_KEY = "t3code:backsteros-task-kickoff-gates";

function normalizeGate(raw: unknown): BacksterosTaskKickoffGate | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    (value.mode !== "gate" && value.mode !== "advanced" && value.mode !== "pending-send") ||
    typeof value.kickoffPrompt !== "string"
  ) {
    return null;
  }
  // Never restore mid-send across reloads.
  const mode = value.mode === "pending-send" ? "gate" : value.mode;
  return { mode, kickoffPrompt: value.kickoffPrompt };
}

export const useBacksterosTaskKickoffGateStore = create<BacksterosTaskKickoffGateStoreState>()(
  persist(
    (set, get) => ({
      byTaskId: {},
      setGate: (taskId, gate) =>
        set((state) => ({
          byTaskId: { ...state.byTaskId, [taskId]: gate },
        })),
      setKickoffPrompt: (taskId, kickoffPrompt) =>
        set((state) => {
          const current = state.byTaskId[taskId];
          if (!current || current.kickoffPrompt === kickoffPrompt) return state;
          return {
            byTaskId: {
              ...state.byTaskId,
              [taskId]: { ...current, kickoffPrompt },
            },
          };
        }),
      setMode: (taskId, mode) =>
        set((state) => {
          const current = state.byTaskId[taskId];
          if (!current || current.mode === mode) return state;
          return {
            byTaskId: {
              ...state.byTaskId,
              [taskId]: { ...current, mode },
            },
          };
        }),
      clear: (taskId) =>
        set((state) => {
          if (!(taskId in state.byTaskId)) return state;
          const { [taskId]: _removed, ...rest } = state.byTaskId;
          return { byTaskId: rest };
        }),
      getGate: (taskId) => get().byTaskId[taskId] ?? null,
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => resolveStorage()),
      version: 1,
      partialize: (state) => ({ byTaskId: state.byTaskId }),
      merge: (persisted, current) => {
        const raw =
          persisted && typeof persisted === "object"
            ? (persisted as { byTaskId?: Record<string, unknown> }).byTaskId
            : null;
        const byTaskId: Record<string, BacksterosTaskKickoffGate> = {};
        if (raw && typeof raw === "object") {
          for (const [taskId, value] of Object.entries(raw)) {
            const gate = normalizeGate(value);
            if (gate) byTaskId[taskId] = gate;
          }
        }
        return { ...current, byTaskId };
      },
    },
  ),
);
