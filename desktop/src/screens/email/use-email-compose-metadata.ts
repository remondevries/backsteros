import {
  getContactEmailAddresses,
  resolveContactEmailForAddress,
} from "@backsteros/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { migrateLegacyTaskStatus, type TaskStatus } from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";
import { useAgentMail } from "../../lib/agentmail-context";
import {
  patchEmailComposeSession,
  readStoredEmailComposeSession,
} from "../../lib/email-compose-session";
import { dispatchEmailListPatch } from "../../lib/use-agentmail-mailboxes";
import { useDesktopWorkspaceData } from "../../lib/workspace-data";

export type ComposeDraftMetadataPayload = {
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
  assigneeId: string | null;
  contactId: string | null;
  organizationId: string | null;
  projectId: string | null;
};

export function useEmailComposeMetadata({
  setComposeTo,
  composeInboxId,
  composeDraftId,
}: {
  setComposeTo: (to: string) => void;
  composeInboxId: string;
  composeDraftId: string | null;
}) {
  const location = useLocation();
  const { client } = useDesktopApi();
  const agentMail = useAgentMail();
  const { contacts, projects } = useDesktopWorkspaceData();
  const [status, setStatus] = useState<TaskStatus>("triage");
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const seededDefaultsRef = useRef(false);
  const seededListRowRef = useRef<string | null>(null);

  const resolveProjectId = useCallback(
    (key: string | null) => {
      if (!key?.trim()) return null;
      return projects.find((entry) => entry.key === key)?.id ?? null;
    },
    [projects],
  );

  const patchPersistedMetadata = useCallback(
    (patch: Partial<ComposeDraftMetadataPayload>) => {
      const inboxId = composeInboxId.trim();
      const draftId = composeDraftId?.trim();
      if (!inboxId || !draftId) return;
      void client
        .requestJson(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(draftId)}/metadata`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        )
        .then(() => {
          dispatchEmailListPatch({
            inboxId,
            messageId: draftId,
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
            ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
            ...(patch.assigneeId !== undefined
              ? { assigneeId: patch.assigneeId }
              : {}),
            ...(patch.contactId !== undefined
              ? { contactId: patch.contactId }
              : {}),
            ...(patch.organizationId !== undefined
              ? { organizationId: patch.organizationId }
              : {}),
          });
        })
        .catch(() => {
          /* list reload will reconcile */
        });
    },
    [client, composeDraftId, composeInboxId],
  );

  useEffect(() => {
    if (seededDefaultsRef.current) return;
    const session = readStoredEmailComposeSession();
    const defaults = session?.threadDefaults;
    if (!defaults) return;
    seededDefaultsRef.current = true;
    if (defaults.status?.trim()) {
      setStatus(migrateLegacyTaskStatus(defaults.status));
    }
    if (typeof defaults.priority === "number") {
      setPriority(defaults.priority);
    }
    if (defaults.dueDate !== undefined) {
      setDueDate(defaults.dueDate ? new Date(defaults.dueDate) : null);
    }
    if (defaults.assigneeId?.trim()) {
      setAssigneeId(defaults.assigneeId.trim());
    }
    patchEmailComposeSession({ threadDefaults: null });
  }, [location.pathname, location.searchStr]);

  useEffect(() => {
    const draftId = composeDraftId?.trim();
    if (!draftId) return;
    if (seededListRowRef.current === draftId) return;
    const row = agentMail.messages.find((entry) => entry.id === draftId);
    if (!row) return;
    seededListRowRef.current = draftId;
    setStatus(migrateLegacyTaskStatus(row.status ?? "triage"));
    setPriority(row.priority ?? 0);
    setDueDate(row.dueDate ? new Date(row.dueDate) : null);
    setOrganizationId(row.organizationId ?? null);
    setContactId(row.contactId ?? null);
    setAssigneeId(row.assigneeId ?? null);
    setProjectKey(row.projectKey ?? null);
  }, [agentMail.messages, composeDraftId]);

  const persistThreadDefaults = useCallback(
    (patch: {
      status?: TaskStatus;
      priority?: number;
      dueDate?: Date | null;
      assigneeId?: string | null;
    }) => {
      const session = readStoredEmailComposeSession();
      if (!session) return;
      const current = session.threadDefaults ?? {};
      patchEmailComposeSession({
        threadDefaults: {
          ...current,
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.dueDate !== undefined
            ? { dueDate: patch.dueDate ? patch.dueDate.toISOString() : null }
            : {}),
          ...(patch.assigneeId !== undefined
            ? { assigneeId: patch.assigneeId }
            : {}),
        },
      });
    },
    [],
  );

  const handleContactChange = useCallback(
    (next: string | null) => {
      setContactId(next);
      const contact = next
        ? contacts.find((entry) => entry.id === next) ?? null
        : null;
      const email =
        resolveContactEmailForAddress(contact, composeTo) ??
        getContactEmailAddresses(contact ?? {})[0] ??
        null;
      if (email) setComposeTo(email);
      patchPersistedMetadata({ contactId: next });
    },
    [contacts, patchPersistedMetadata, setComposeTo],
  );

  const metadataPayload: ComposeDraftMetadataPayload = {
    status,
    priority,
    dueDate: dueDate ? dueDate.toISOString() : null,
    assigneeId,
    contactId,
    organizationId,
    projectId: resolveProjectId(projectKey),
  };

  return {
    status,
    setStatus: (next: TaskStatus) => {
      setStatus(next);
      persistThreadDefaults({ status: next });
      patchPersistedMetadata({ status: next });
    },
    priority,
    setPriority: (next: number) => {
      setPriority(next);
      persistThreadDefaults({ priority: next });
      patchPersistedMetadata({ priority: next });
    },
    dueDate,
    setDueDate: (next: Date | null) => {
      setDueDate(next);
      persistThreadDefaults({ dueDate: next });
      patchPersistedMetadata({
        dueDate: next ? next.toISOString() : null,
      });
    },
    organizationId,
    setOrganizationId: (next: string | null) => {
      setOrganizationId(next);
      patchPersistedMetadata({ organizationId: next });
    },
    contactId,
    assigneeId,
    setAssigneeId: (next: string | null) => {
      setAssigneeId(next);
      persistThreadDefaults({ assigneeId: next });
      patchPersistedMetadata({ assigneeId: next });
    },
    projectKey,
    setProjectKey: (next: string | null) => {
      setProjectKey(next);
      patchPersistedMetadata({ projectId: resolveProjectId(next) });
    },
    handleContactChange,
    metadataPayload,
  };
}
