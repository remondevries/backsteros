import type { SocialAnalyticsSnapshot } from "@backsteros/contracts";
import type { SocialAnalyticsClient } from "@backsteros/ui";

import type { BacksterosApiClient } from "@backsteros/api-client";

/** Core REST adapter for Network Analytics (LinkedIn via Zernio). */
export function createSocialAnalyticsClient(
  client: BacksterosApiClient,
): SocialAnalyticsClient {
  return {
    async get({ accountKind, period, platform }) {
      const params = new URLSearchParams({
        accountKind,
        period,
        platform,
      });
      return client.requestJson<SocialAnalyticsSnapshot>(
        `/api/v1/social/analytics?${params}`,
      );
    },
  };
}
