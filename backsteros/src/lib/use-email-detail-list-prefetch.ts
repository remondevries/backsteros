import { useEffect } from "react";
import type { BacksterosApiClient } from "@backsteros/api-client";
import type { InboxEmailListItem } from "@backsteros/ui";

import {
  resolveEmailDetailPrefetchTargets,
  scheduleEmailDetailListPrefetch,
} from "./email-detail-list-prefetch";

/**
 * Warm email/draft detail cache for the on-screen Messages list (window
 * around focus, else list head) so Open is usually a cache hit.
 */
export function useEmailDetailListPrefetch(input: {
  enabled: boolean;
  client: BacksterosApiClient;
  emails: readonly InboxEmailListItem[];
  orderedRowIds: readonly string[];
  focusRowId?: string | null;
}): void {
  const { enabled, client, emails, orderedRowIds, focusRowId = null } = input;

  useEffect(() => {
    if (!enabled) return;
    if (emails.length === 0 || orderedRowIds.length === 0) return;
    const targets = resolveEmailDetailPrefetchTargets({
      emails,
      orderedRowIds,
      focusRowId,
    });
    return scheduleEmailDetailListPrefetch(client, targets);
  }, [client, emails, enabled, focusRowId, orderedRowIds]);
}
