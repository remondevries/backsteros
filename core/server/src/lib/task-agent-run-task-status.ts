/**
 * Mirror factory `task_agent_runs.phase` onto the task's Linear-style status
 * and OS-96 agent-working badge (conductor contact).
 */

export type TaskAgentRunPhaseForStatus =
  | "brief"
  | "build"
  | "verify"
  | "record"
  | "ship"
  | "done"
  | "failed"
  | string;

export type FactoryTaskStatusSync = {
  /** Next task status, or null to leave status alone. */
  status: "in_progress" | "in_review" | null;
  /** Claim the conductor as working on the task. */
  claimWorking: boolean;
  /** Clear any agent-working marker. */
  clearWorking: boolean;
};

/** Statuses we never override from a factory run (terminal / parked). */
export const FACTORY_TASK_STATUS_LOCKED = new Set([
  "completed",
  "canceled",
  "duplicated",
]);

/**
 * brief/build → in progress + working flag on the selected conductor.
 * verify/record/ship/done → in review (hand-off) and clear working.
 * failed → clear working only.
 */
export function taskSyncForAgentRunPhase(
  phase: TaskAgentRunPhaseForStatus,
): FactoryTaskStatusSync {
  switch (phase) {
    case "brief":
    case "build":
      return {
        status: "in_progress",
        claimWorking: true,
        clearWorking: false,
      };
    case "verify":
    case "record":
    case "ship":
    case "done":
      return {
        status: "in_review",
        claimWorking: false,
        clearWorking: true,
      };
    case "failed":
      return {
        status: null,
        claimWorking: false,
        clearWorking: true,
      };
    default:
      return {
        status: null,
        claimWorking: false,
        clearWorking: false,
      };
  }
}

export function shouldApplyFactoryTaskStatus(
  currentStatus: string,
  nextStatus: "in_progress" | "in_review" | null,
): nextStatus is "in_progress" | "in_review" {
  if (nextStatus == null) return false;
  if (FACTORY_TASK_STATUS_LOCKED.has(currentStatus)) return false;
  return currentStatus !== nextStatus;
}
