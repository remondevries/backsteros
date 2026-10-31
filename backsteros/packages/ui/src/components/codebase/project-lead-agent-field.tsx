"use client";

import { useMemo, useState } from "react";

import { DROPDOWN_NONE_VALUE } from "../dropdowns/dropdown-options.js";
import type { AssigneeDropdownContact } from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";
import { buildLeadAgentDropdownOptions } from "./lead-agent-dropdown-options.js";

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

const NO_LEAD_AGENT_LABEL = "No lead agent";

/**
 * Closed-chip label for Lead agent. Always a non-empty string so the inline
 * chip cannot collapse when the roster is empty or the lead is missing from it.
 */
export function resolveLeadAgentChipLabel(
  selectedId: string | null,
  options: ReadonlyArray<{ value: string; label: string }>,
): string {
  if (!selectedId) return NO_LEAD_AGENT_LABEL;
  const matched = options.find((option) => option.value === selectedId);
  const name = matched?.label?.trim() || "";
  return name || NO_LEAD_AGENT_LABEL;
}

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

  const selectedId = project.leadAgentContactId?.trim() || null;

  const options = useMemo(
    () => buildLeadAgentDropdownOptions(agentContacts, { avatarSrcById }),
    [agentContacts, avatarSrcById],
  );

  // Name only on the closed chip; job title stays on list options via secondaryLabel.
  // Always a non-empty string — empty selectedDisplayLabel + empty option label
  // collapses the inline chip once the roster resolves.
  const selectedDisplayLabel = resolveLeadAgentChipLabel(selectedId, options);

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
        fallbackLabel={NO_LEAD_AGENT_LABEL}
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
