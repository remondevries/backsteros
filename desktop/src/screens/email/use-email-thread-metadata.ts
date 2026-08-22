import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  AgentMailMessageDetail,
  EmailThreadMetadata,
} from "@backsteros/contracts";
import { migrateLegacyTaskStatus, type TaskStatus } from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";
import { dispatchEmailListPatch } from "../../lib/use-agentmail-mailboxes";
import { useDesktopWorkspaceData } from "../../lib/workspace-data";

import { resolveEmailThreadKey } from "./email-page-helpers";

export function useEmailThreadMetadata({
  inboxId,
  message,
  setMessage,
}: {
  inboxId: string | undefined;
  message: AgentMailMessageDetail | null;
  setMessage: Dispatch<SetStateAction<AgentMailMessageDetail | null>>;
}) {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const { contacts, projects } = workspace;
  const [statusOverride, setStatusOverride] = useState<TaskStatus | null>(null);
  const [priorityOverride, setPriorityOverride] = useState<number | null>(null);
  const [dueDateOverride, setDueDateOverride] = useState<Date | null | undefined>(
    undefined,
  );
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(null);

  const threadMetadataSyncKey = message
    ? [
        message.messageId,
        message.threadMetadata?.organizationId ?? "",
        message.threadMetadata?.contactId ?? "",
        message.threadMetadata?.assigneeId ?? "",
        message.threadMetadata?.projectId ?? "",
        message.threadMetadata?.projectKey ?? "",
        message.threadMetadata?.status ?? "",
        message.threadMetadata?.priority ?? "",
        message.threadMetadata?.dueDate ?? "",
      ].join("|")
    : "";

  useEffect(() => {
    const metadata = message?.threadMetadata;
    setStatusOverride(null);
    setPriorityOverride(null);
    setDueDateOverride(undefined);
    setOrganizationId(metadata?.organizationId ?? null);
    setContactId(metadata?.contactId ?? null);
    setAssigneeId(metadata?.assigneeId ?? null);
    const linkedProject = metadata?.projectId
      ? projects.find((entry) => entry.id === metadata.projectId)
      : null;
    setProjectKey(linkedProject?.key ?? metadata?.projectKey ?? null);
    // Fingerprint avoids resetting local overrides when polls return a new
    // object with the same metadata values.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on key only
  }, [threadMetadataSyncKey, projects]);

  const patchThreadMetadata = useCallback(
    async (patch: {
      organizationId?: string | null;
      contactId?: string | null;
      assigneeId?: string | null;
      projectId?: string | null;
      status?: TaskStatus;
      priority?: number;
      dueDate?: string | null;
    }) => {
      if (!inboxId || !message) return;
      const threadKey = resolveEmailThreadKey(message);
      const updated = await client.requestJson<EmailThreadMetadata>(
        `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadKey)}/metadata`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setMessage((current) =>
        current ? { ...current, threadMetadata: updated } : current,
      );
    },
    [client, inboxId, message],
  );

  /** Auto-promote thread status while working with the agent / finishing a draft. */
  const promoteEmailThreadStatus = useCallback(
    (next: "in_progress" | "in_review" | "on_hold") => {
      if (!inboxId || !message) return;
      const current = migrateLegacyTaskStatus(
        statusOverride ?? message.threadMetadata?.status ?? "triage",
      );
      if (current === next) return;

      const canPromoteToInProgress =
        next === "in_progress" &&
        (current === "triage" ||
          current === "ready_to_start" ||
          current === "backlog");
      const canPromoteToInReview =
        next === "in_review" &&
        (current === "triage" ||
          current === "ready_to_start" ||
          current === "backlog" ||
          current === "in_progress");
      const canPromoteToOnHold = next === "on_hold";
      if (next === "in_progress" && !canPromoteToInProgress) return;
      if (next === "in_review" && !canPromoteToInReview) return;
      if (next === "on_hold" && !canPromoteToOnHold) return;

      setStatusOverride(next);
      dispatchEmailListPatch({
        inboxId,
        messageId: message.messageId,
        threadId: message.threadId ?? null,
        status: next,
      });
      void patchThreadMetadata({ status: next });
    },
    [inboxId, message, patchThreadMetadata, statusOverride],
  );

  const handleContactChange = useCallback(
    (next: string | null) => {
      setContactId(next);
      const contact = next
        ? contacts.find((entry) => entry.id === next) ?? null
        : null;
      if (inboxId && message) {
        dispatchEmailListPatch({
          inboxId,
          messageId: message.messageId,
          threadId: message.threadId ?? null,
          contactId: next,
          contactName: contact?.name ?? null,
        });
      }
      void patchThreadMetadata({ contactId: next });
    },
    [contacts, inboxId, message, patchThreadMetadata],
  );

  return {
    statusOverride,
    setStatusOverride,
    priorityOverride,
    setPriorityOverride,
    dueDateOverride,
    setDueDateOverride,
    organizationId,
    setOrganizationId,
    contactId,
    assigneeId,
    setAssigneeId,
    projectKey,
    setProjectKey,
    patchThreadMetadata,
    promoteEmailThreadStatus,
    handleContactChange,
  };
}
