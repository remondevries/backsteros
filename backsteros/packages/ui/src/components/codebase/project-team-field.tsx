"use client";

import type { ProjectChannel } from "@backsteros/contracts";
import { normalizeProjectChannel, projectChannelMemberIds } from "@backsteros/contracts";
import { PlusIcon } from "@primer/octicons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { Tooltip } from "../shared/tooltip.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";
import {
  listAddableProjectTeamAgents,
  resolveProjectTeamMembers,
  type ProjectTeamAgent,
} from "./project-team-members.js";

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
  /**
   * Member ids from a header Sync that landed before workspace refresh.
   * `null` / omit → use `project.channel.members`.
   */
  memberIdsOverride?: readonly string[] | null;
  /** Sync failures from {@link ProjectTeamSyncButton} in the Agents header. */
  syncError?: string | null;
  /** Fired when invite/sync lands a new room list (same as Sync button). */
  onMembersChange?: (memberIds: string[]) => void;
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

function buildAddMemberOptions(
  agents: readonly ProjectTeamAgent[],
  avatarSrcById?: Readonly<Record<string, string | null | undefined>>,
): SearchableDropdownOption<string>[] {
  return agents.map((agent) => {
    const contactId = agent.contactId?.trim() || "";
    const grokbotId = agent.grokbotAgentId?.trim() || "";
    const value = contactId || grokbotId;
    const name = agent.name?.trim() || "Agent";
    // Match Lead agent: show the contact job title, not the agent-settings role.
    const jobTitle = agent.jobTitle?.trim() || undefined;
    return {
      value,
      label: name,
      secondaryLabel: jobTitle,
      searchTerms: [name, jobTitle, grokbotId].filter(Boolean).join(" "),
      icon: (
        <AssigneeListMark
          label={name}
          avatarSrc={(contactId ? avatarSrcById?.[contactId] : null) ?? null}
          size={18}
        />
      ),
    };
  });
}

/**
 * Locations → Team. Room members plus Add. Sync lives on the Agents subgroup
 * header (title · line · sync) via {@link ProjectTeamSyncButton}.
 */
export function ProjectTeamField({
  project,
  agents,
  avatarSrcById,
  requestJson,
  memberIdsOverride = null,
  syncError = null,
  onMembersChange,
}: ProjectTeamFieldProps) {
  const channel = parseChannel(project.channel);
  const channelMemberIds = projectChannelMemberIds(channel);
  const channelMemberKey = channelMemberIds.join(",");
  const projectId = project.id;
  const leadContactId = project.leadAgentContactId ?? null;

  const [polledMemberIds, setPolledMemberIds] = useState<string[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const cancelPollRef = useRef<(() => void) | null>(null);

  // Workspace catch-up clears a sync override; parent override wins while set.
  useEffect(() => {
    setPolledMemberIds(null);
  }, [channelMemberKey, projectId]);

  useEffect(() => {
    if (memberIdsOverride) {
      setPolledMemberIds([...memberIdsOverride]);
    }
  }, [memberIdsOverride]);

  useEffect(() => () => cancelPollRef.current?.(), []);

  const memberIds = polledMemberIds ?? channelMemberIds;
  const members = resolveProjectTeamMembers(memberIds, agents, avatarSrcById, {
    excludeContactId: leadContactId,
  });
  const connected = Boolean(channel?.uri?.trim());

  const addableAgents = useMemo(
    () =>
      listAddableProjectTeamAgents(memberIds, agents, {
        excludeContactId: leadContactId,
      }),
    [agents, leadContactId, memberIds],
  );
  const addOptions = useMemo(
    () => buildAddMemberOptions(addableAgents, avatarSrcById),
    [addableAgents, avatarSrcById],
  );

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
          onMembersChange?.(next);
          setInviting(false);
          return;
        }
      } catch {
        // Keep waiting — a dropped poll should not end the invite.
      }
    }
    if (!cancelled) {
      setInviting(false);
      setInviteError(
        "Invite sent, but the room list did not update yet. Try Sync, or wait for the lead agent.",
      );
    }
  }

  async function inviteAgent(optionValue: string) {
    const trimmed = optionValue.trim();
    if (!trimmed || inviting || !connected) return;
    const agent = addableAgents.find((entry) => {
      const contactId = entry.contactId?.trim() || "";
      const grokbotId = entry.grokbotAgentId?.trim() || "";
      return contactId === trimmed || grokbotId === trimmed;
    });
    if (!agent) {
      setInviteError("That agent is not available to invite.");
      return;
    }

    cancelPollRef.current?.();
    setInviting(true);
    setInviteError(null);
    const before = memberIds.join(",");
    try {
      const result = await requestJson<{
        ok?: boolean;
        pending?: boolean;
        alreadyMember?: boolean;
        error?: string | null;
        members?: string[];
      }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/channel/members/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: agent.contactId?.trim() || null,
            grokbotAgentId: agent.grokbotAgentId?.trim() || null,
          }),
        },
      );
      if (result?.ok === false) {
        setInviting(false);
        setInviteError(result.error?.trim() || "Could not reach the lead agent.");
        return;
      }
      if (result?.alreadyMember && Array.isArray(result.members)) {
        setPolledMemberIds(result.members);
        onMembersChange?.(result.members);
        setInviting(false);
        return;
      }
      void pollForMembers(before);
    } catch (err) {
      setInviting(false);
      setInviteError(apiErrorMessage(err) || "Could not invite that agent.");
    }
  }

  const combinedError = inviteError || syncError;
  const addDisabled =
    !connected || addOptions.length === 0 || inviting;

  return (
    <div className="project-team-field">
      {members.length > 0 ? (
        <ul className="project-team-field__list">
          {members.map((member) => {
            const tip = member.known
              ? member.jobTitle?.trim() || member.role?.trim() || ""
              : `No BacksterOS agent reported ${member.id}`;
            return (
              <Tooltip
                key={member.id}
                label={tip || member.name}
                disabled={!tip}
                side="top"
                openDelay={200}
              >
                <li
                  className={[
                    "project-team-field__member",
                    member.known ? "" : "is-unknown",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <AssigneeListMark
                    label={member.name}
                    avatarSrc={member.avatarSrc}
                    size={18}
                  />
                  <span className="project-team-field__name">{member.name}</span>
                </li>
              </Tooltip>
            );
          })}
        </ul>
      ) : (
        <span className="project-team-field__empty">
          {connected
            ? inviting
              ? "Inviting…"
              : "No team yet"
            : "No channel"}
        </span>
      )}

      <div className="project-team-field__actions">
        <div className="project-team-field__add">
          <Tooltip
            label={
              !connected
                ? "Connect a Channel first"
                : inviting
                  ? "Waiting for the lead agent to update the room"
                  : addOptions.length === 0
                    ? "No other agents with a Grok Bot id to invite"
                    : "Invite an agent into the room"
            }
            side="top"
            openDelay={200}
          >
            <span className="project-team-field__add-wrap">
              <PropertyDropdown
                value={null}
                options={addOptions}
                onChange={(value) => {
                  if (typeof value === "string" && value.trim()) {
                    void inviteAgent(value);
                  }
                }}
                searchPlaceholder={
                  inviting ? "Inviting…" : "Add agent…"
                }
                ariaLabel="Add agent to Team"
                fallbackLabel="Add"
                fallbackIcon={<PlusIcon size={12} />}
                hideTriggerLabel
                disabled={addDisabled}
                panelWidth={280}
                panelAlign="end"
                mutedFallback
              />
            </span>
          </Tooltip>
        </div>
      </div>

      {combinedError ? (
        <span className="project-channel-field__error" role="alert">
          {combinedError}
        </span>
      ) : null}
    </div>
  );
}

/** Member ids currently shown for this project (channel or sync override). */
export function projectTeamMemberIdsForField(
  project: ProjectTeamFieldProject,
  memberIdsOverride?: readonly string[] | null,
): string[] {
  if (memberIdsOverride != null) return [...memberIdsOverride];
  return projectChannelMemberIds(parseChannel(project.channel));
}
