/** Heartbeats older than this are not considered live. */
export const TASK_AGENT_PRESENCE_TTL_MS = 45_000;

export function isTaskAgentPresenceLive(
  lastHeartbeatAt: Date,
  now: Date = new Date(),
  ttlMs: number = TASK_AGENT_PRESENCE_TTL_MS,
): boolean {
  return now.getTime() - lastHeartbeatAt.getTime() <= ttlMs;
}
