/**
 * Replication direction policy for CLOUD_TO_LOCAL_ONLY_TABLES — pure, no DB.
 *
 * - local role: never push these tables to the cloud peer.
 * - cloud role: never apply these tables received from the local peer
 *   (neither peer push nor a cloud-initiated pull of the local feed).
 */

import type { CoreReplicationRole } from "./config.js";
import { isCloudToLocalOnlyTable } from "./constants.js";

export function resolveReplicationRoleFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CoreReplicationRole {
  return env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud"
    ? "cloud"
    : "local";
}

/** Local → cloud push is forbidden for cloud-authoritative tables. */
export function shouldSkipLocalToCloudPush(
  table: string,
  role: CoreReplicationRole,
): boolean {
  return role === "local" && isCloudToLocalOnlyTable(table);
}

/** Cloud must refuse rows that originate on the local peer for these tables. */
export function shouldRefusePeerApplyOnCloud(
  table: string,
  role: CoreReplicationRole,
): boolean {
  return role === "cloud" && isCloudToLocalOnlyTable(table);
}
