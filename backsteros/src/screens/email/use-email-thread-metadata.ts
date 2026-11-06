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
import {
  dispatchEmailListPatch,
  EMAIL_LIST_PATCH_EVENT,
  type EmailListPatchDetail,
} from "../../lib/use-agentmail-mailboxes";
import {
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
} from "../../lib/workspace-data";

import { resolveEmailThreadKey } from "./email-page-helpers";

function projectKeyFromMetadata(
  metadata: EmailThreadMetadata | null | undefined,
  projects: readonly { id: string; key: string }[],
): string | null {
  if (!metadata) return null;
  const linked = metadata.projectId
    ? (projects.find((entry) => entry.id === metadata.projectId) ?? null)
    : null;
  return linked?.key ?? metadata.projectKey ?? null;
}

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
  const { contacts, organizations } = useDesktopWorkspacePeople();
  const { projects } = useDesktopWorkspaceProjects();
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
    const nextOrganizationId = metadata?.organizationId ?? null;
    const nextContactId = metadata?.contactId ?? null;
    setOrganizationId(nextOrganizationId);
    setContactId(nextContactId);
    setAssigneeId(metadata?.assigneeId ?? null);
    setProjectKey(projectKeyFromMetadata(metadata, projects));
    // Keep Messages list avatars in sync after leaving the thread — open-row
    // UI used to inject org/contact only while selected.
    if (inboxId && message) {
      const contact = nextContactId
        ? (contacts.find((entry) => entry.id === nextContactId) ?? null)
        : null;
      const organization = nextOrganizationId
        ? (organizations.find((entry) => entry.id === nextOrganizationId) ??
          null)
        : null;
      dispatchEmailListPatch({
        inboxId,
        messageId: message.messageId,
        threadId: message.threadId ?? null,
        organizationId: nextOrganizationId,
        organizationName: organization?.name ?? null,
        contactId: nextContactId,
        contactName: contact?.name ?? null,
      });
    }
    // Fingerprint only — do not re-run when `projects` identity changes or
    // in-flight property edits (priority/project) get wiped mid-PATCH.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on key only
  }, [threadMetadataSyncKey]);

  // When workspace projects hydrate after metadata already has a projectId,
  // resolve the key without resetting other local property overrides.
  useEffect(() => {
    const metadata = message?.threadMetadata;
    if (!metadata?.projectId || projectKey) return;
    const linked = projects.find((entry) => entry.id === metadata.projectId);
    if (linked?.key) setProjectKey(linked.key);
  }, [message?.threadMetadata, projectKey, projects]);

  // Communication rail patches the shared email list; mirror those into the
  // open thread so composer / detail local state stay aligned.
  useEffect(() => {
    if (!inboxId || !message) return;
    const openInboxId = inboxId;
    const openMessageId = message.messageId;
    const openThreadId = message.threadId?.trim() || null;

    function handleListPatch(event: Event) {
      const detail = (event as CustomEvent<EmailListPatchDetail>).detail;
      if (!detail || detail.inboxId !== openInboxId) return;
      const sameMessage = detail.messageId === openMessageId;
      const sameThread =
        Boolean(openThreadId) &&
        Boolean(detail.threadId?.trim()) &&
        detail.threadId === openThreadId;
      if (!sameMessage && !sameThread) return;

      if (detail.status !== undefined) {
        setStatusOverride(migrateLegacyTaskStatus(detail.status));
      }
      if (detail.priority !== undefined) {
        setPriorityOverride(detail.priority);
      }
      if (detail.dueDate !== undefined) {
        setDueDateOverride(detail.dueDate ? new Date(detail.dueDate) : null);
      }
      if (detail.organizationId !== undefined) {
        setOrganizationId(detail.organizationId);
      }
      if (detail.contactId !== undefined) {
        setContactId(detail.contactId);
      }
      if (detail.assigneeId !== undefined) {
        setAssigneeId(detail.assigneeId);
      }
      if (detail.projectKey !== undefined) {
        setProjectKey(detail.projectKey);
      } else if (detail.projectId !== undefined) {
        const linked = detail.projectId
          ? (projects.find((entry) => entry.id === detail.projectId) ?? null)
          : null;
        setProjectKey(linked?.key ?? null);
      }

      setMessage((current) => {
        if (!current) return current;
        const prev = current.threadMetadata;
        if (!prev) return current;
        return {
          ...current,
          threadMetadata: {
            ...prev,
            ...(detail.status !== undefined
              ? { status: migrateLegacyTaskStatus(detail.status) }
              : {}),
            ...(detail.priority !== undefined
              ? { priority: detail.priority }
              : {}),
            ...(detail.dueDate !== undefined ? { dueDate: detail.dueDate } : {}),
            ...(detail.organizationId !== undefined
              ? {
                  organizationId: detail.organizationId,
                  organizationName:
                    detail.organizationName !== undefined
                      ? detail.organizationName
                      : prev.organizationName,
                }
              : {}),
            ...(detail.contactId !== undefined
              ? {
                  contactId: detail.contactId,
                  contactName:
                    detail.contactName !== undefined
                      ? detail.contactName
                      : prev.contactName,
                }
              : {}),
            ...(detail.assigneeId !== undefined
              ? {
                  assigneeId: detail.assigneeId,
                  assigneeName:
                    detail.assigneeName !== undefined
                      ? detail.assigneeName
                      : prev.assigneeName,
                }
              : {}),
            ...(detail.projectId !== undefined
              ? {
                  projectId: detail.projectId,
                  projectName:
                    detail.projectName !== undefined
                      ? detail.projectName
                      : prev.projectName,
                  projectKey:
                    detail.projectKey !== undefined
                      ? detail.projectKey
                      : prev.projectKey,
                }
              : {}),
            ...(detail.projectKey !== undefined && detail.projectId === undefined
              ? { projectKey: detail.projectKey }
              : {}),
          },
        };
      });
    }

    window.addEventListener(EMAIL_LIST_PATCH_EVENT, handleListPatch);
    return () =>
      window.removeEventListener(EMAIL_LIST_PATCH_EVENT, handleListPatch);
  }, [inboxId, message, projects, setMessage]);

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

      // Optimistic detail merge so property dropdowns stay on the new value
      // while the PATCH is in flight (and so list↔detail sync keys match).
      setMessage((current) => {
        if (!current?.threadMetadata) return current;
        const prev = current.threadMetadata;
        const nextProjectId =
          patch.projectId !== undefined ? patch.projectId : prev.projectId;
        const linked = nextProjectId
          ? (projects.find((entry) => entry.id === nextProjectId) ?? null)
          : null;
        return {
          ...current,
          threadMetadata: {
            ...prev,
            ...patch,
            ...(patch.projectId !== undefined
              ? {
                  projectId: patch.projectId,
                  projectKey: linked?.key ?? null,
                  projectName: linked?.name ?? null,
                }
              : {}),
          },
        };
      });

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
    [client, inboxId, message, projects, setMessage],
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
