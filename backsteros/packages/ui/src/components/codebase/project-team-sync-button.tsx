"use client";

import type { ProjectChannel } from "@backsteros/contracts";
import {
  normalizeProjectChannel,
  projectChannelMemberIds,
} from "@backsteros/contracts";
import { SyncIcon } from "@primer/octicons-react";
import { useEffect, useRef, useState } from "react";

import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";

const MEMBERS_POLL_INTERVAL_MS = 2_000;
const MEMBERS_POLL_TIMEOUT_MS = 90_000;

export type ProjectTeamSyncButtonProject = {
  id: string;
  channel?: ProjectChannel | string | null;
};

export type ProjectTeamSyncButtonProps = {
  project: ProjectTeamSyncButtonProject;
  requestJson: CodebaseRequestJson;
  /**
   * Member ids currently shown (so Sync can detect when the room changes).
   * Pass the same list Team is rendering.
   */
  memberIds: readonly string[];
  /** Fired when the lead answers with a new room list. */
  onMembersChange?: (memberIds: string[]) => void;
  /** Surface sync failures next to Team (or elsewhere). */
  onError?: (message: string | null) => void;
};

function parseChannel(
  channel: ProjectChannel | string | null | undefined,
): ProjectChannel | null {
  if (channel == null) return null;
  if (typeof channel === "string") {
    try {
      return normalizeProjectChannel(JSON.parse(channel) as ProjectChannel);
    } catch {
      return normalizeProjectChannel(channel);
    }
  }
  return normalizeProjectChannel(channel);
}

/**
 * Agents subgroup header control — asks the lead agent to re-report room
 * members. Lives on the "Agents" rule (title · line · sync), not on Team.
 */
export function ProjectTeamSyncButton({
  project,
  requestJson,
  memberIds,
  onMembersChange,
  onError,
}: ProjectTeamSyncButtonProps) {
  const [waiting, setWaiting] = useState(false);
  const channel = parseChannel(project.channel);
  const connected = Boolean(channel?.uri?.trim());
  const projectId = project.id;
  const memberKey = memberIds.join(",");

  const cancelPollRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPollRef.current?.(), []);

  async function pollForMembers(before: string) {
    let cancelled = false;
    cancelPollRef.current = () => {
      cancelled = true;
    };
    const deadline = Date.now() + MEMBERS_POLL_TIMEOUT_MS;
    while (!cancelled && Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, MEMBERS_POLL_INTERVAL_MS),
      );
      if (cancelled) return;
      try {
        const row = await requestJson<{ channel?: ProjectChannel | null }>(
          `/api/v1/projects/${encodeURIComponent(projectId)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        const next = projectChannelMemberIds(parseChannel(row?.channel));
        if (next.join(",") !== before) {
          onMembersChange?.(next);
          setWaiting(false);
          return;
        }
      } catch {
        // Keep waiting — a dropped poll should not end the sync.
      }
    }
    if (!cancelled) setWaiting(false);
  }

  async function syncTeam() {
    cancelPollRef.current?.();
    setWaiting(true);
    onError?.(null);
    try {
      const result = await requestJson<{ ok?: boolean; error?: string | null }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/channel/members/sync`,
        { method: "POST" },
      );
      if (result?.ok === false) {
        setWaiting(false);
        onError?.(result.error?.trim() || "Could not reach the lead agent.");
        return;
      }
    } catch (err) {
      setWaiting(false);
      onError?.(apiErrorMessage(err) || "Could not request a Team sync.");
      return;
    }
    void pollForMembers(memberKey);
  }

  return (
    <button
      type="button"
      className={[
        "project-team-field__icon-btn",
        "entity-overview-subgroup__header-action",
        waiting ? "is-syncing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={waiting || !connected}
      title={
        connected
          ? "Ask the lead agent who is in the room"
          : "Connect a Channel first"
      }
      aria-label="Sync Team from the chat room"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void syncTeam();
      }}
    >
      <SyncIcon size={12} />
    </button>
  );
}
