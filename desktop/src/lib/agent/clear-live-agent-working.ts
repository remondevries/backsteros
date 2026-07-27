/**
 * Mark / clear live "agent working" without importing the terminal panel
 * (keeps apply-agent-turn-completed and session start free of circular deps).
 *
 * Multiple subscribers can register (PTY live activity + status-context UI
 * working set). Mark runs when a turn starts; clear runs when it ends or the
 * task is stopped/held.
 */

type WorkingFn = (taskId: string) => void;

const markWorkingImpls = new Set<WorkingFn>();
const clearWorkingImpls = new Set<WorkingFn>();

export function registerMarkLiveAgentWorking(fn: WorkingFn): () => void {
  markWorkingImpls.add(fn);
  return () => {
    markWorkingImpls.delete(fn);
  };
}

export function registerClearLiveAgentWorking(fn: WorkingFn): () => void {
  clearWorkingImpls.add(fn);
  return () => {
    clearWorkingImpls.delete(fn);
  };
}

/** Optimistic working mark (list pulse + title shimmer) before PTY hooks attach. */
export function markLiveAgentWorkingForTask(taskId: string): void {
  const id = taskId.trim();
  if (!id) return;
  for (const fn of markWorkingImpls) {
    fn(id);
  }
}

export function clearLiveAgentWorkingForTask(taskId: string): void {
  const id = taskId.trim();
  if (!id) return;
  for (const fn of clearWorkingImpls) {
    fn(id);
  }
}
