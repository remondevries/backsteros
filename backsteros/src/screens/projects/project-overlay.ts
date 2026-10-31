import { useMemo } from "react";
import type { ProjectOverviewRowProject } from "@backsteros/ui";

export type WorkspaceProject = ProjectOverviewRowProject & {
  organizationId?: string | null;
  type?: string;
  localWorkingDirectory?: string | null;
  developmentLocation?: string | null;
  productionLocation?: string | null;
  localLocation?: string | null;
  developmentSetupStatus?: "pending" | "ready" | "failed" | null;
  developmentSetupError?: string | null;
  githubRepository?: string | null;
  provider?: string | null;
  category?: string | null;
  healthCheckMode?: "simple" | "advanced" | null;
  healthCheckDomain?: string | null;
  leadAgentContactId?: string | null;
  channel?: {
    uri: string;
    name?: string | null;
  } | null;
  channelStatus?: "inactive" | "connecting" | "needs_details" | "active" | null;
  channelStage?:
    | "looking_for_room"
    | "joining_room"
    | "creating_room"
    | "adding_users"
    | "finishing"
    | null;
  channelPendingLink?: string | null;
  channelRequestedAt?: string | null;
};

/** Optimistic per-project patches applied before sync confirms them. */
export type ProjectOverlay = Record<string, Partial<WorkspaceProject>>;

const CHANNEL_STATUS_RANK: Record<string, number> = {
  inactive: 0,
  connecting: 1,
  needs_details: 2,
  active: 3,
};

function channelStatusRank(status: string | null | undefined): number {
  if (!status) return 0;
  return CHANNEL_STATUS_RANK[status] ?? 0;
}

/**
 * Drop optimistic Channel fields once live workspace data has caught up or
 * moved past them (Connect → connecting overlay must not stick after agent
 * sets active).
 */
export function pruneProjectChannelOverlay(
  overlay: ProjectOverlay,
  liveProjects: readonly {
    id: string;
    channelStatus?: string | null;
    channelStage?: string | null;
    channelPendingLink?: string | null;
  }[],
): ProjectOverlay {
  let changed = false;
  const next: ProjectOverlay = { ...overlay };
  for (const id of Object.keys(next)) {
    const patch = next[id];
    if (!patch) continue;
    const live = liveProjects.find((project) => project.id === id);
    if (!live) continue;
    const touchesChannel =
      patch.channelStatus !== undefined ||
      patch.channelStage !== undefined ||
      patch.channelPendingLink !== undefined ||
      patch.channel !== undefined ||
      patch.channelRequestedAt !== undefined;
    if (!touchesChannel) continue;

    const overlayStatus = patch.channelStatus ?? null;
    const liveStatus = live.channelStatus ?? null;
    const liveAhead =
      channelStatusRank(liveStatus) > channelStatusRank(overlayStatus) ||
      (overlayStatus != null &&
        liveStatus != null &&
        overlayStatus === liveStatus &&
        overlayStatus !== "connecting");
    const liveCaughtConnecting =
      overlayStatus === "connecting" &&
      liveStatus != null &&
      liveStatus !== "inactive";

    if (liveAhead || liveCaughtConnecting) {
      const {
        channel: _channel,
        channelStatus: _status,
        channelStage: _stage,
        channelPendingLink: _link,
        channelRequestedAt: _requested,
        ...rest
      } = patch;
      if (Object.keys(rest).length === 0) {
        delete next[id];
      } else {
        next[id] = rest;
      }
      changed = true;
    }
  }
  return changed ? next : overlay;
}

/** Workspace projects with optimistic overlay patches merged in. */
export function useProjectsWithOverlay<T extends { id: string }>(
  projects: readonly T[],
  overlay: ProjectOverlay,
): T[] {
  return useMemo(
    () =>
      projects.map((project) => ({
        ...project,
        ...overlay[project.id],
      })),
    [overlay, projects],
  );
}
