"use client";

import { isProjectChannelPendingLink } from "@backsteros/contracts";
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { ChatProjectOption } from "../../chat/chat-project-option.js";
import { buildLeadAgentDropdownOptions } from "../codebase/lead-agent-dropdown-options.js";
import type { AssigneeDropdownContact } from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";

export type ChatSlashProjectConnectHandlers = {
  agentContacts: readonly AssigneeDropdownContact[];
  avatarSrcById?: Readonly<Record<string, string | null | undefined>>;
  onOpenPendingLink?: ((href: string) => void) | null;
  onCreateChannel: (
    projectId: string,
    leadAgentContactId: string,
  ) => void | Promise<void>;
};

function resolveStatus(
  project: ChatProjectOption,
): "connecting" | "needs_details" | "inactive" {
  if (project.channelStatus === "connecting") return "connecting";
  if (project.channelStatus === "needs_details") return "needs_details";
  return "inactive";
}

/**
 * Trailing control for a non-ready `/` project row: Connect → agent + Create,
 * or Connecting… / Needs details status.
 */
export function ChatSlashProjectConnectControls({
  project,
  expanded,
  onExpandedChange,
  handlers,
}: {
  project: ChatProjectOption;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  handlers: ChatSlashProjectConnectHandlers;
}) {
  const status = resolveStatus(project);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const options = useMemo(
    () =>
      buildLeadAgentDropdownOptions(handlers.agentContacts, {
        avatarSrcById: handlers.avatarSrcById,
        includeNone: false,
      }),
    [handlers.agentContacts, handlers.avatarSrcById],
  );

  const selectedDisplayLabel =
    options.find((option) => option.value === selectedAgentId)?.label ?? null;

  if (status === "connecting") {
    return (
      <span className="chat-ui-composer__slash-option-status" aria-live="polite">
        Connecting…
      </span>
    );
  }

  if (status === "needs_details") {
    const href = project.channelPendingLink?.trim() ?? "";
    const canOpen = isProjectChannelPendingLink(href);
    if (!canOpen) {
      return (
        <span className="chat-ui-composer__slash-option-status">Needs details</span>
      );
    }
    return (
      <button
        type="button"
        className="chat-ui-composer__slash-option-action"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handlers.onOpenPendingLink?.(href);
        }}
        onClick={(event) => event.stopPropagation()}
      >
        Needs details
      </button>
    );
  }

  if (expanded) {
    return (
      <span
        className="chat-ui-composer__slash-option-connect-form"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          onExpandedChange(false);
          setSelectedAgentId(null);
        }}
      >
        <PropertyDropdown
          value={selectedAgentId}
          options={options}
          onChange={(value) => {
            setSelectedAgentId(value.trim() || null);
          }}
          searchPlaceholder="Lead agent…"
          ariaLabel="Lead agent"
          fallbackLabel="Choose agent"
          fallbackIcon={null}
          selectedDisplayLabel={selectedDisplayLabel}
          triggerVariant="inlineChip"
          mutedFallback
          panelWidth={280}
          disabled={creating}
        />
        <button
          type="button"
          className="chat-ui-composer__slash-option-action chat-ui-composer__slash-option-action--create"
          disabled={creating || !selectedAgentId}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (!selectedAgentId || creating) return;
            setCreating(true);
            void Promise.resolve(
              handlers.onCreateChannel(project.id, selectedAgentId),
            ).finally(() => {
              setCreating(false);
              onExpandedChange(false);
              setSelectedAgentId(null);
            });
          }}
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="chat-ui-composer__slash-option-action"
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onExpandedChange(true);
      }}
      onClick={(event) => event.stopPropagation()}
    >
      Connect
    </button>
  );
}
