"use client";

import type { ProjectChannel } from "@backsteros/contracts";
import { normalizeProjectChannel, projectChannelMemberIds } from "@backsteros/contracts";
import { PlusIcon } from "@primer/octicons-react";
import { useEffect, useMemo, useState } from "react";

import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";
import {
  listAddableProjectTeamAgents,
  resolveProjectTeamMembers,
  type ProjectTeamAgent,
} from "./project-team-members.js";

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
    const role = agent.role?.trim() || undefined;
    return {
      value,
      label: name,
      secondaryLabel: role,
      searchTerms: [name, role, grokbotId].filter(Boolean).join(" "),
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
  requestJson: _requestJson,
  memberIdsOverride = null,
  syncError = null,
}: ProjectTeamFieldProps) {
  void _requestJson;
  const channel = parseChannel(project.channel);
  const channelMemberIds = projectChannelMemberIds(channel);
  const channelMemberKey = channelMemberIds.join(",");
  const projectId = project.id;
  const leadContactId = project.leadAgentContactId ?? null;

  const [polledMemberIds, setPolledMemberIds] = useState<string[] | null>(null);

  // Workspace catch-up clears a sync override; parent override wins while set.
  useEffect(() => {
    setPolledMemberIds(null);
  }, [channelMemberKey, projectId]);

  useEffect(() => {
    if (memberIdsOverride) {
      setPolledMemberIds([...memberIdsOverride]);
    }
  }, [memberIdsOverride]);

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

      <div className="project-team-field__actions">
        <div className="project-team-field__add">
          <PropertyDropdown
            value={null}
            options={addOptions}
            onChange={() => {
              // UI only — invite / report wiring comes next.
            }}
            searchPlaceholder="Add agent…"
            ariaLabel="Add agent to Team"
            fallbackLabel="Add"
            fallbackIcon={<PlusIcon size={12} />}
            hideTriggerLabel
            disabled={!connected || addOptions.length === 0}
            panelWidth={280}
            panelAlign="end"
            mutedFallback
          />
        </div>
      </div>

      {syncError ? (
        <span className="project-channel-field__error" role="alert">
          {syncError}
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
