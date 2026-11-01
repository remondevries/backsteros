"use client";

import type { ProjectChannel } from "@backsteros/contracts";
import { normalizeProjectChannel, projectChannelMemberIds } from "@backsteros/contracts";
import { SyncIcon } from "@primer/octicons-react";
import { useState } from "react";

import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";
import {
  resolveProjectTeamMembers,
  type ProjectTeamAgent,
} from "./project-team-members.js";

export type ProjectTeamFieldProject = {
  id: string;
  channel?: ProjectChannel | string | null;
};

export type ProjectTeamFieldProps = {
  project: ProjectTeamFieldProject;
  /** Agent personas with their reported Grok Bot ids. */
  agents: readonly ProjectTeamAgent[];
  avatarSrcById?: Readonly<Record<string, string | null | undefined>>;
  requestJson: CodebaseRequestJson;
};

function parseChannel(
  project: ProjectTeamFieldProject,
): ProjectChannel | null {
  const raw = project.channel;
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return normalizeProjectChannel(JSON.parse(raw) as ProjectChannel);
    } catch {
      return normalizeProjectChannel(raw);
    }
  }
  return normalizeProjectChannel(raw);
}

/**
 * Locations → Team. The agents in the project's chat room, plus a Sync button
 * that asks the lead agent to re-report them (the agent answers by PATCHing
 * `channel.members`, so the list fills in once that lands).
 */
export function ProjectTeamField({
  project,
  agents,
  avatarSrcById,
  requestJson,
}: ProjectTeamFieldProps) {
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channel = parseChannel(project);
  const members = resolveProjectTeamMembers(
    projectChannelMemberIds(channel),
    agents,
    avatarSrcById,
  );
  const connected = Boolean(channel?.uri?.trim());

  async function syncTeam() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestJson<{ ok?: boolean; error?: string | null }>(
        `/api/v1/projects/${encodeURIComponent(project.id)}/channel/members/sync`,
        { method: "POST" },
      );
      if (result?.ok === false) {
        setError(result.error?.trim() || "Could not reach the lead agent.");
        return;
      }
      setNotice("Asked the lead agent — the list updates when it answers.");
    } catch (err) {
      setError(apiErrorMessage(err) || "Could not request a Team sync.");
    } finally {
      setSyncing(false);
    }
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
        className="project-team-field__sync"
        disabled={syncing || !connected}
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
        <span>{syncing ? "Syncing…" : "Sync"}</span>
      </button>

      {error ? (
        <span className="project-channel-field__error" role="alert">
          {error}
        </span>
      ) : notice ? (
        <span className="project-team-field__notice">{notice}</span>
      ) : null}
    </div>
  );
}
