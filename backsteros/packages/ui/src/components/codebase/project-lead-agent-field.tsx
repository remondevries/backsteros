"use client";

import { useMemo, useState } from "react";

import {
  buildAssigneeDropdownOptions,
  DROPDOWN_NONE_VALUE,
  type AssigneeDropdownContact,
} from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";

export type ProjectLeadAgentFieldProject = {
  id: string;
  leadAgentContactId?: string | null;
  updatedAt?: string;
};

export type ProjectLeadAgentFieldProps = {
  project: ProjectLeadAgentFieldProject;
  onProjectUpdated: (project: ProjectLeadAgentFieldProject) => void;
  requestJson: CodebaseRequestJson;
  /**
   * Contacts that are agent personas (enabled `agents.contact_id`).
   * Host filters via `/api/v1/agents` — not all workspace contacts.
   */
  agentContacts: readonly AssigneeDropdownContact[];
  avatarSrcById?: Readonly<Record<string, string | null | undefined>>;
};

/**
 * Agents → Lead agent. Avatar chip + picker of agent contacts.
 * Default none.
 */
export function ProjectLeadAgentField({
  project,
  onProjectUpdated,
  requestJson,
  agentContacts,
  avatarSrcById,
}: ProjectLeadAgentFieldProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    const titleById = new Map(
      agentContacts.map((contact) => [
        contact.id,
        contact.title?.trim() || null,
      ]),
    );
    return buildAssigneeDropdownOptions([...agentContacts], {
      avatarSrcById,
    }).map((option) => {
      if (option.value === DROPDOWN_NONE_VALUE) {
        return {
          ...option,
          label: "No lead agent",
          searchTerms: "none no lead agent unassigned",
        };
      }
      const title = titleById.get(option.value) ?? null;
      if (!title) return option;
      return {
        ...option,
        secondaryLabel: title,
        searchTerms: `${option.searchTerms ?? ""} ${title}`.trim(),
      };
    });
  }, [agentContacts, avatarSrcById]);

  const selectedId = project.leadAgentContactId?.trim() || null;
  // Name only on the closed chip; job title stays on list options via secondaryLabel.
  const selectedDisplayLabel =
    options.find((option) => option.value === selectedId)?.label ?? null;

  async function setLeadAgent(nextContactId: string | null) {
    setSaving(true);
    setError(null);
    const previous = project;
    try {
      onProjectUpdated({
        ...project,
        leadAgentContactId: nextContactId,
        updatedAt: new Date().toISOString(),
      });
      const updated = await requestJson<ProjectLeadAgentFieldProject>(
        `/api/v1/projects/${encodeURIComponent(project.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadAgentContactId: nextContactId }),
        },
      );
      onProjectUpdated({
        ...project,
        leadAgentContactId: updated.leadAgentContactId ?? nextContactId,
      });
    } catch (err) {
      onProjectUpdated(previous);
      setError(apiErrorMessage(err) || "Could not update Lead agent.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="project-lead-agent-field">
      <PropertyDropdown
        value={selectedId}
        options={options}
        onChange={(value) => {
          const next =
            value === DROPDOWN_NONE_VALUE || !value.trim() ? null : value;
          void setLeadAgent(next);
        }}
        searchPlaceholder="Lead agent…"
        ariaLabel="Lead agent"
        fallbackLabel="No lead agent"
        fallbackIcon={null}
        selectedDisplayLabel={selectedDisplayLabel}
        triggerVariant="inlineChip"
        disabled={saving}
        mutedFallback
        panelWidth={280}
      />
      {error ? (
        <span className="project-channel-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
