import { useEffect } from "react";

import { useThreadActions } from "~/hooks/useThreadActions";

import {
  registerBacksterosTaskChatSettleHandler,
  settleBoundBacksterosTaskChatIfCompleted,
} from "./settleTaskChatOnComplete";
import { subscribeBacksterosTaskStatusChanged } from "./promoteWorkingTask";

/**
 * Settles the bound T3 chat when a BacksterOS task is marked completed
 * (dropdown, promote notify, or other status publish paths).
 */
export function useSettleBacksterosTaskChatOnComplete(): void {
  const { settleThread } = useThreadActions();

  useEffect(() => {
    return registerBacksterosTaskChatSettleHandler((target) => {
      void settleThread(target);
    });
  }, [settleThread]);

  useEffect(() => {
    return subscribeBacksterosTaskStatusChanged(({ taskId, status }) => {
      settleBoundBacksterosTaskChatIfCompleted(taskId, status);
    });
  }, []);
}
