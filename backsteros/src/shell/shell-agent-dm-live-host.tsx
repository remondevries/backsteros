import { useAgentDmNotifications } from "./use-agent-dm-notifications";

/**
 * Always-mounted host for cloud shell-chat SSE → window events.
 * The sidebar banner also uses {@link useAgentDmNotifications}, but it is
 * omitted on settings pages — this host keeps the open chat thread live.
 */
export function ShellAgentDmLiveHost() {
  useAgentDmNotifications();
  return null;
}
