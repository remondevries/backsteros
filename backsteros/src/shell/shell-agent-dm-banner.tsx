import { AgentMessageNotificationStack } from "@backsteros/ui/shell";

import { useAgentDmNotifications } from "./use-agent-dm-notifications";

/** Live unseen agent DM cards for the product sidebar footer banner. */
export function ShellAgentDmBanner() {
  const { items } = useAgentDmNotifications();
  if (items.length === 0) return null;
  return <AgentMessageNotificationStack items={items} />;
}
