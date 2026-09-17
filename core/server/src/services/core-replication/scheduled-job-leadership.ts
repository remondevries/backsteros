import { getCoreReplicationConfig } from "./config.js";
import { isReplicationPeerReachable } from "./peer-reachability.js";

/**
 * Hybrid scheduled jobs (meeting reminders, recurring tasks): local-core runs
 * when online; cloud-core runs only when the local peer is unreachable.
 * Standalone cores (no replication config) always run on this process.
 */
export async function shouldRunHybridScheduledJob(
  disabledEnvVar?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (disabledEnvVar && env[disabledEnvVar]?.trim() === "0") {
    return false;
  }

  const config = getCoreReplicationConfig(env);
  if (!config) {
    return true;
  }

  if (config.role === "local") {
    return true;
  }

  const localReachable = await isReplicationPeerReachable(config);
  return !localReachable;
}

export function isHybridScheduledJobExplicitlyDisabled(
  disabledEnvVar: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[disabledEnvVar]?.trim() === "0";
}
