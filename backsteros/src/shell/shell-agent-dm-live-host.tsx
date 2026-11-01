/**
 * @deprecated Prefer {@link AgentDmNotificationsProvider} at shell chrome —
 * it owns the single SSE / poll loop. Kept as a no-op so older imports compile.
 */
export function ShellAgentDmLiveHost() {
  return null;
}
