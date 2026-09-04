import type { WhoopDayResult } from "@backsteros/contracts";
import { Platform } from "react-native";

import { formatLocalYmd } from "../lib/task-due-date";
import {
  mapWhoopSnapshotToHomeGlance,
  type HomeGlanceWhoopInput,
} from "./home-glance-model";

type WhoopApiClient = {
  requestJson: <T>(path: string) => Promise<T>;
};

/**
 * Today's Whoop sleep / recovery / strain for the medium widget.
 * Uses the core API (same as journal). Returns a hidden placeholder when the
 * client is missing, Whoop is disconnected, or the request fails.
 */
export async function loadHomeGlanceWhoop(
  client: WhoopApiClient | null | undefined,
): Promise<HomeGlanceWhoopInput> {
  if (Platform.OS !== "ios" || !client) {
    return mapWhoopSnapshotToHomeGlance(null, false);
  }

  try {
    const date = formatLocalYmd(new Date());
    const result = await client.requestJson<WhoopDayResult>(
      `/api/v1/whoop/day?date=${encodeURIComponent(date)}`,
    );
    return mapWhoopSnapshotToHomeGlance(
      result.snapshot ?? null,
      result.authenticated,
    );
  } catch {
    return mapWhoopSnapshotToHomeGlance(null, false);
  }
}
