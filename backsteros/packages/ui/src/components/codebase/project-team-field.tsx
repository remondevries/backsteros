"use client";

import type { ProjectChannel } from "@backsteros/contracts";
import { normalizeProjectChannel, projectChannelMemberIds } from "@backsteros/contracts";
import { SyncIcon } from "@primer/octicons-react";
import { useEffect, useRef, useState } from "react";

import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";
import {
  resolveProjectTeamMembers,
  type ProjectTeamAgent,
} from "./project-team-members.js";

/** The agent answers out of band — watch the project until the room lands. */
const MEMBERS_POLL_INTERVAL_MS = 2_000;
const MEMBERS_POLL_TIMEOUT_MS = 90_000;

export type ProjectTeamFieldProject = {
  id: string;
  channel?: ProjectChannel | string | null;
  /** Shown by the Lead agent property, so it is left out of the Team list. */
  leadAgentContactId?: string | null;
};

export type ProjectTeamFieldProps = {
  project: ProjectTeamFieldProject;
  /** Agent personas with their reported Grok Bot ids. */
  agents: readonly ProjectTeamAgent[];
  avatarSrcById?: Readonly<Record<string, string | null | undefined>>;
  requestJson: CodebaseRequestJson;
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
 * Locations → Team. The agents in the project's chat room, plus a Sync button
 * that asks the lead agent to re-report them. The agent answers by PATCHing
 * `channel.members` on cloud-core, so the button keeps watching the project
 * until the new room lands instead of waiting for the next render.
 */
export function ProjectTeamField({
  project,
  agents,
  avatarSrcById,
  requestJson,
}: ProjectTeamFieldProps) {
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Members read straight from the project while waiting for an answer. */
  const [polledMemberIds, setPolledMemberIds] = useState<string[] | null>(null);

  const channel = parseChannel(project.channel);
  const channelMemberIds = projectChannelMemberIds(channel);
  const channelMemberKey = channelMemberIds.join(",");
  const projectId = project.id;

  // Once the workspace row catches up, drop the poll result and follow it.
  useEffect(() => {
    setPolledMemberIds(null);
  }, [channelMemberKey, projectId]);

  const cancelPollRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPollRef.current?.(), []);

  const memberIds = polledMemberIds ?? channelMemberIds;
  const members = resolveProjectTeamMembers(memberIds, agents, avatarSrcById, {
    excludeContactId: project.leadAgentContactId ?? null,
  });
  const connected = Boolean(channel?.uri?.trim());

  async function syncTeam() {
    cancelPollRef.current?.();
    setWaiting(true);
    setError(null);
    try {
      const result = await requestJson<{ ok?: boolean; error?: string | null }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/channel/members/sync`,
        { method: "POST" },
      );
      if (result?.ok === false) {
        setWaiting(false);
        setError(result.error?.trim() || "Could not reach the lead agent.");
        return;
      }
    } catch (err) {
      setWaiting(false);
      setError(apiErrorMessage(err) || "Could not request a Team sync.");
      return;
    }
    void pollForMembers(memberIds.join(","));
  }

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
          setPolledMemberIds(next);
          setWaiting(false);
          return;
        }
      } catch {
        // Keep waiting — a dropped poll should not end the sync.
      }
    }
    if (!cancelled) setWaiting(false);
  }

  return (
    <div className="project-team-field">
      {members.length > 0 ? (
        <ul className="project-team-field__list">
          {members.map((member) => (
            <li
              key={member.id}
              className={[
                "project-team-field__member",
                member.known ? "" : "is-unknown",
              ]
                .filter(Boolean)
                .join(" ")}
              title={
                member.known
                  ? [member.name, member.role].filter(Boolean).join(" · ")
                  : `No BacksterOS agent reported ${member.id}`
              }
            >
              <AssigneeListMark
                label={member.name}
                avatarSrc={member.avatarSrc}
                size={18}
              />
              <span className="project-team-field__name">{member.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="project-team-field__empty">
          {connected ? "No team yet" : "No channel"}
        </span>
      )}

      <button
        type="button"
        className={[
          "project-team-field__sync",
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
        onClick={() => {
          void syncTeam();
        }}
      >
        <SyncIcon size={12} />
      </button>

      {error ? (
        <span className="project-channel-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
