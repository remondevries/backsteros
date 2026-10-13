import { usePromoteWorkingBacksterosTasks } from "./promoteWorkingTask";
import { useSettleBacksterosTaskChatOnComplete } from "./useSettleBacksterosTaskChatOnComplete";
import { useSyncBacksterosAgentPresence } from "./useBacksterosAgentPresence";
import { useSyncBacksterosControlBindings } from "./useSyncBacksterosControlBindings";

/**
 * Keeps BacksterOS↔agent lifecycle alive in both vibe and log sidebar modes.
 *
 * `BacksterosPanel` only mounts in log mode; without this, promoting a bound
 * task to In Progress / In Review stops as soon as you switch to the chat.
 */
export function BacksterosWorkingLifecycle(): null {
  usePromoteWorkingBacksterosTasks();
  useSyncBacksterosAgentPresence(true);
  useSyncBacksterosControlBindings(true);
  useSettleBacksterosTaskChatOnComplete();
  return null;
}
