"use client";

import type { ProjectChannel } from "@backsteros/contracts";
import { normalizeProjectChannel } from "@backsteros/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { DROPDOWN_NONE_VALUE } from "../dropdowns/dropdown-options.js";
import type { AssigneeDropdownContact } from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";
import { shouldRequestLeadAgentTransfer } from "./lead-agent-transfer.js";
import { buildLeadAgentDropdownOptions } from "./lead-agent-dropdown-options.js";

/** Current lead invites the candidate out of band — watch until the id flips. */
const TRANSFER_POLL_INTERVAL_MS = 2_000;
const TRANSFER_POLL_TIMEOUT_MS = 90_000;

export type ProjectLeadAgentFieldProject = {
  id: string;
  leadAgentContactId?: string | null;
  channel?: ProjectChannel | string | null;
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

type TransferResponse = {
  ok?: boolean;
  pending?: boolean;
  error?: string | null;
  leadAgentContactId?: string | null;
  nextLeadAgentContactId?: string | null;
  project?: ProjectLeadAgentFieldProject;
};

function parseChannelUri(
  channel: ProjectChannel | string | null | undefined,
): string | null {
  if (channel == null) return null;
  if (typeof channel === "string") {
    try {
      return (
        normalizeProjectChannel(JSON.parse(channel) as ProjectChannel)?.uri?.trim() ||
        null
      );
    } catch {
      return normalizeProjectChannel(channel)?.uri?.trim() || null;
    }
  }
  return normalizeProjectChannel(channel)?.uri?.trim() || null;
}

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
 * Default none. With a connected Channel, a swap asks the current lead to
 * invite (if needed) before BacksterOS commits the new id.
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
  /** Optimistic selection while a room handoff is outstanding. */
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);

  const liveLeadId = project.leadAgentContactId?.trim() || null;
  const selectedId = pendingContactId ?? liveLeadId;

  useEffect(() => {
    if (pendingContactId && liveLeadId === pendingContactId) {
      setPendingContactId(null);
    }
  }, [liveLeadId, pendingContactId]);

  const cancelPollRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPollRef.current?.(), []);

  const options = useMemo(
    () => buildLeadAgentDropdownOptions(agentContacts, { avatarSrcById }),
    [agentContacts, avatarSrcById],
  );

  // Name only on the closed chip; job title stays on list options via secondaryLabel.
  // Always a non-empty string — empty selectedDisplayLabel + empty option label
  // collapses the inline chip once the roster resolves.
  const selectedDisplayLabel = resolveLeadAgentChipLabel(selectedId, options);

  async function pollUntilLead(
    expected: string | null,
    previous: ProjectLeadAgentFieldProject,
  ) {
    let cancelled = false;
    cancelPollRef.current = () => {
      cancelled = true;
    };
    const deadline = Date.now() + TRANSFER_POLL_TIMEOUT_MS;
    while (!cancelled && Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, TRANSFER_POLL_INTERVAL_MS),
      );
      if (cancelled) return;
      try {
        const row = await requestJson<ProjectLeadAgentFieldProject>(
          `/api/v1/projects/${encodeURIComponent(project.id)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        const next = row?.leadAgentContactId?.trim() || null;
        if (next === expected) {
          setPendingContactId(null);
          onProjectUpdated({
            ...project,
            leadAgentContactId: next,
            channel: row.channel ?? project.channel,
          });
          setSaving(false);
          return;
        }
      } catch {
        // Keep waiting — a dropped poll should not end the transfer.
      }
    }
    if (!cancelled) {
      setPendingContactId(null);
      onProjectUpdated(previous);
      setError("The current lead did not finish transferring the room.");
      setSaving(false);
    }
  }

  async function setLeadAgent(nextContactId: string | null) {
    cancelPollRef.current?.();
    setSaving(true);
    setError(null);
    const previous = project;
    const previousId = previous.leadAgentContactId?.trim() || null;
    const expectRoomHandoff = shouldRequestLeadAgentTransfer({
      previousContactId: previousId,
      nextContactId,
      channelUri: parseChannelUri(project.channel),
    });

    try {
      onProjectUpdated({
        ...project,
        leadAgentContactId: nextContactId,
        updatedAt: new Date().toISOString(),
      });
      if (expectRoomHandoff) {
        setPendingContactId(nextContactId);
      }

      const result = await requestJson<TransferResponse>(
        `/api/v1/projects/${encodeURIComponent(project.id)}/lead-agent/transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadAgentContactId: nextContactId }),
        },
      );

      if (result?.ok === false) {
        setPendingContactId(null);
        onProjectUpdated(previous);
        setError(result.error?.trim() || "Could not update Lead agent.");
        setSaving(false);
        return;
      }

      if (result?.pending) {
        void pollUntilLead(nextContactId, previous);
        return;
      }

      const applied =
        result?.project?.leadAgentContactId ??
        result?.leadAgentContactId ??
        nextContactId;
      setPendingContactId(null);
      onProjectUpdated({
        ...project,
        ...(result?.project ?? {}),
        leadAgentContactId: applied,
      });
      setSaving(false);
    } catch (err) {
      setPendingContactId(null);
      onProjectUpdated(previous);
      setError(apiErrorMessage(err) || "Could not update Lead agent.");
      setSaving(false);
    }
  }

  return (
    <div
      className={[
        "project-lead-agent-field",
        saving ? "is-transferring" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
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
        triggerVariant="default"
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
