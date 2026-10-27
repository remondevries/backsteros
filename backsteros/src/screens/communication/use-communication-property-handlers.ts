import {
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { BacksterosApiClient } from "@backsteros/api-client";
import {
  applyCommunicationEmailPartyLink,
  inboxListItemToTaskItemRowTask,
  resolveEmailThreadMetadataKey,
  type ChatConversationStatus,
  type CommunicationEmailActiveParty,
  type EmailMessagePartyLink,
  type EmailMessagePartyMap,
  type InboxEmailListItem,
  type InboxTaskListItem,
  type TaskStatus,
} from "@backsteros/ui";
import type { ChatConversation } from "@backsteros/contracts";

import { patchEmailTaskListItem } from "../../lib/email-list-tasks";
import type { DesktopWorkspaceData } from "../../lib/workspace/workspace-data-types";

export type ComposeEmailMeta = {
  status: string;
  priority: number;
  dueDate: number | null;
  assigneeId: string | null;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
};

export const EMPTY_COMPOSE_EMAIL_META: ComposeEmailMeta = {
  status: "triage",
  priority: 0,
  dueDate: null,
  assigneeId: null,
  projectId: null,
  projectKey: null,
  projectName: null,
};

type EmailPatch = {
  status?: TaskStatus | string;
  priority?: number;
  dueDate?: string | null;
  projectId?: string | null;
  assigneeId?: string | null;
  messageParties?: EmailMessagePartyMap;
  messageParty?: {
    messageId: string;
    contactId?: string | null;
    organizationId?: string | null;
  };
};

type EmailListExtras = {
  projectName?: string | null;
  projectKey?: string | null;
  assigneeName?: string | null;
};

/** Which entity the right-rail property edits apply to. */
type RailMode = "compose" | "support" | "email" | "chat" | "none";

export type CommunicationPropertyHandlersContext = {
  client: BacksterosApiClient;
  contacts: DesktopWorkspaceData["contacts"];
  projects: DesktopWorkspaceData["projects"];
  isComposingEmail: boolean;
  selectedEmail: InboxEmailListItem | null;
  selectedSupport: InboxTaskListItem | null;
  selectedChatConversation: ChatConversation | null;
  supportRelatedOrganizationIds: readonly string[];
  patchTask: (patch: Record<string, unknown>) => void;
  /** Compose (new email or open draft). */
  composeParty: EmailMessagePartyLink;
  composePartyEmail: string | null;
  composePartyManualRef: MutableRefObject<boolean>;
  setComposeParty: Dispatch<SetStateAction<EmailMessagePartyLink>>;
  setComposeEmailMeta: Dispatch<SetStateAction<ComposeEmailMeta>>;
  ensureContactHasOtherEmail: (
    contactId: string,
    address: string,
  ) => Promise<void>;
  /** Thread party state. */
  selectedEmailMessageId: string | null;
  emailActiveParty: CommunicationEmailActiveParty | null;
  emailSelectedParty: CommunicationEmailActiveParty | null;
  selectedMessageParty: EmailMessagePartyLink | null;
  emailPartyEmail: string | null;
  setEmailMessageParties: Dispatch<SetStateAction<EmailMessagePartyMap>>;
  setEmailActiveParty: Dispatch<
    SetStateAction<CommunicationEmailActiveParty | null>
  >;
  setEmailSelectedParty: Dispatch<
    SetStateAction<CommunicationEmailActiveParty | null>
  >;
  /** Chat conversation edits. */
  setChatStatus: (status: ChatConversationStatus) => unknown;
  patchChatConversation: (patch: {
    contactId?: string | null;
    organizationId?: string | null;
    assigneeId?: string | null;
    priority?: number;
    dueDate?: string | null;
  }) => unknown;
};

function railMode(ctx: CommunicationPropertyHandlersContext): RailMode {
  if (ctx.isComposingEmail) return "compose";
  if (ctx.selectedSupport) return "support";
  if (ctx.selectedEmail) return "email";
  if (ctx.selectedChatConversation) return "chat";
  return "none";
}

function findProjectByKey(
  projects: DesktopWorkspaceData["projects"],
  projectKey: string | null,
) {
  const needle = projectKey?.trim().toLowerCase();
  if (!needle) return null;
  return projects.find((entry) => entry.key.trim().toLowerCase() === needle) ?? null;
}

async function patchEmail(
  ctx: CommunicationPropertyHandlersContext,
  patch: EmailPatch,
  listExtras?: EmailListExtras,
): Promise<EmailMessagePartyMap | null> {
  const email = ctx.selectedEmail;
  if (!email) return null;
  const task = inboxListItemToTaskItemRowTask(email);
  if (!task) return null;
  if (patch.messageParty !== undefined || patch.messageParties !== undefined) {
    const threadKey = resolveEmailThreadMetadataKey({
      kind: email.draftId ? "draft" : "message",
      draftId: email.draftId,
      threadId: email.threadId,
      messageId: email.messageId,
    });
    if (!threadKey) return null;
    const metadataBody: Pick<EmailPatch, "messageParties" | "messageParty"> =
      {};
    if (patch.messageParties !== undefined) {
      metadataBody.messageParties = patch.messageParties;
    }
    if (patch.messageParty !== undefined) {
      metadataBody.messageParty = patch.messageParty;
    }
    const updated = await ctx.client.requestJson<{
      messageParties?: EmailMessagePartyMap;
    }>(
      `/api/v1/email/inboxes/${encodeURIComponent(email.inboxId)}/threads/${encodeURIComponent(threadKey)}/metadata`,
      { method: "PATCH", body: JSON.stringify(metadataBody) },
    );
    return updated?.messageParties ?? null;
  }
  await patchEmailTaskListItem(ctx.client, task, patch, listExtras);
  return null;
}

/** Message the rail link/unlink applies to (selected, else latest, else list). */
function focusMessageId(
  ctx: CommunicationPropertyHandlersContext,
  email: InboxEmailListItem,
): string {
  return (
    ctx.emailSelectedParty?.messageId?.trim() ||
    ctx.selectedEmailMessageId?.trim() ||
    ctx.emailActiveParty?.messageId?.trim() ||
    email.messageId
  );
}

/** Per-message link only — never writes thread-level contact/org ids. */
async function linkMessageParty(
  ctx: CommunicationPropertyHandlersContext,
  messageId: string,
  nextParty: EmailMessagePartyLink,
  options: { seedWhenEmpty: boolean },
): Promise<void> {
  const updated = await patchEmail(ctx, {
    messageParty: { messageId, ...nextParty },
  });
  ctx.setEmailMessageParties((prev) => ({
    ...prev,
    ...(updated ?? {}),
    [messageId]: nextParty,
  }));
  // Seed when the thread has not hydrated yet so create-org → link paints now.
  const apply = (prev: CommunicationEmailActiveParty | null) =>
    prev || options.seedWhenEmpty
      ? applyCommunicationEmailPartyLink(prev, messageId, nextParty)
      : prev;
  ctx.setEmailActiveParty(apply);
  ctx.setEmailSelectedParty(apply);
}

/**
 * Stable right-rail + thread handlers for Communication. One mode resolver
 * (compose → support → email) replaces per-handler branching; handlers read
 * the latest page state from a ref so memoized children do not re-render.
 */
export function useCommunicationPropertyHandlers(
  ctx: CommunicationPropertyHandlersContext,
) {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  return useMemo(() => {
    const current = () => ctxRef.current;

    const editProperty = (edit: {
      compose: (prev: ComposeEmailMeta) => ComposeEmailMeta;
      support: Record<string, unknown>;
      email: EmailPatch;
      emailExtras?: EmailListExtras;
    }) => {
      const c = current();
      switch (railMode(c)) {
        case "compose":
          c.setComposeEmailMeta(edit.compose);
          return;
        case "support":
          c.patchTask(edit.support);
          return;
        case "email":
          void patchEmail(c, edit.email, edit.emailExtras);
          return;
        case "chat":
        case "none":
          return;
      }
    };

    return {
      onStatusChange: (status: ChatConversationStatus) => {
        void current().setChatStatus(status);
      },
      onAssigneeChange: (assigneeId: string | null) => {
        void current().patchChatConversation({ assigneeId });
      },
      onPriorityChange: (priority: number) => {
        void current().patchChatConversation({ priority });
      },
      onDueDateChange: (dueDate: Date | null) => {
        void current().patchChatConversation({
          dueDate: dueDate ? dueDate.toISOString() : null,
        });
      },

      onEmailStatusChange: (status: TaskStatus) =>
        editProperty({
          compose: (prev) => ({ ...prev, status }),
          support: { status },
          email: { status },
        }),
      onEmailPriorityChange: (priority: number) =>
        editProperty({
          compose: (prev) => ({ ...prev, priority }),
          support: { priority },
          email: { priority },
        }),
      onEmailDueDateChange: (dueDate: Date | null) => {
        const iso = dueDate ? dueDate.toISOString() : null;
        editProperty({
          compose: (prev) => ({
            ...prev,
            dueDate: dueDate ? dueDate.getTime() : null,
          }),
          support: { dueDate: iso },
          email: { dueDate: iso },
        });
      },
      onEmailAssigneeChange: (assigneeId: string | null) => {
        const contact = assigneeId
          ? current().contacts.find((entry) => entry.id === assigneeId)
          : null;
        editProperty({
          compose: (prev) => ({ ...prev, assigneeId }),
          support: { assigneeId },
          email: { assigneeId },
          emailExtras: { assigneeName: contact?.name ?? null },
        });
      },
      onEmailProjectChange: (projectKey: string | null) => {
        const project = findProjectByKey(current().projects, projectKey);
        editProperty({
          compose: (prev) => ({
            ...prev,
            projectId: project?.id ?? null,
            projectKey: project?.key ?? null,
            projectName: project?.name ?? null,
          }),
          support: {
            projectId: project?.id ?? null,
            projectKey: project?.key ?? null,
          },
          email: { projectId: project?.id ?? null },
          emailExtras: {
            projectKey: project?.key ?? null,
            projectName: project?.name ?? null,
          },
        });
      },

      onLinkOrganization: async (organizationId: string) => {
        const c = current();
        if (!organizationId) return;
        switch (railMode(c)) {
          case "compose":
            c.composePartyManualRef.current = true;
            c.setComposeParty((prev) => ({ ...prev, organizationId }));
            return;
          case "support":
            c.patchTask({ relatedOrganizationIds: [organizationId] });
            return;
          case "email": {
            const email = c.selectedEmail!;
            await linkMessageParty(c, focusMessageId(c, email), {
              contactId:
                c.selectedMessageParty?.contactId ??
                c.emailSelectedParty?.contactId ??
                null,
              organizationId,
            }, { seedWhenEmpty: true });
            return;
          }
          case "chat":
            await c.patchChatConversation({ organizationId });
            return;
          case "none":
            return;
        }
      },

      onUnlinkOrganization: async () => {
        const c = current();
        switch (railMode(c)) {
          case "compose":
            c.composePartyManualRef.current = true;
            c.setComposeParty((prev) => ({ ...prev, organizationId: null }));
            return;
          case "support":
            c.patchTask({ relatedOrganizationIds: [] });
            return;
          case "email": {
            const email = c.selectedEmail!;
            await linkMessageParty(c, focusMessageId(c, email), {
              contactId:
                c.selectedMessageParty?.contactId ??
                c.emailSelectedParty?.contactId ??
                null,
              organizationId: null,
            }, { seedWhenEmpty: false });
            return;
          }
          case "chat":
            await c.patchChatConversation({ organizationId: null });
            return;
          case "none":
            return;
        }
      },

      onLinkContact: async (contactId: string) => {
        const c = current();
        if (!contactId) return;
        const contact =
          c.contacts.find((entry) => entry.id === contactId) ?? null;
        const contactOrgId = contact?.organizationId?.trim() || null;
        switch (railMode(c)) {
          case "compose":
            if (c.composePartyEmail) {
              await c.ensureContactHasOtherEmail(contactId, c.composePartyEmail);
            }
            c.composePartyManualRef.current = true;
            c.setComposeParty({
              contactId,
              organizationId:
                contactOrgId || c.composeParty.organizationId || null,
            });
            return;
          case "support":
            c.patchTask({
              relatedContactIds: [contactId],
              contactId,
              relatedOrganizationIds: contactOrgId
                ? [contactOrgId]
                : [...c.supportRelatedOrganizationIds],
            });
            return;
          case "email": {
            const email = c.selectedEmail!;
            const partyEmail =
              c.emailSelectedParty?.address?.trim() ||
              c.emailPartyEmail?.trim() ||
              null;
            if (partyEmail) {
              await c.ensureContactHasOtherEmail(contactId, partyEmail);
            }
            await linkMessageParty(c, focusMessageId(c, email), {
              contactId,
              organizationId:
                contactOrgId ||
                c.selectedMessageParty?.organizationId ||
                c.emailSelectedParty?.organizationId ||
                c.emailActiveParty?.organizationId ||
                null,
            }, { seedWhenEmpty: true });
            return;
          }
          case "chat": {
            const patch: {
              contactId: string;
              organizationId?: string | null;
            } = { contactId };
            // Prefer the contact's org when the chat has none yet.
            const existingOrg =
              c.selectedChatConversation?.organizationId?.trim() || null;
            if (contactOrgId && !existingOrg) {
              patch.organizationId = contactOrgId;
            }
            await c.patchChatConversation(patch);
            return;
          }
          case "none":
            return;
        }
      },

      onUnlinkContact: async () => {
        const c = current();
        switch (railMode(c)) {
          case "compose":
            c.composePartyManualRef.current = true;
            c.setComposeParty((prev) => ({ ...prev, contactId: null }));
            return;
          case "support":
            c.patchTask({ relatedContactIds: [], contactId: null });
            return;
          case "email": {
            const email = c.selectedEmail!;
            await linkMessageParty(c, focusMessageId(c, email), {
              contactId: null,
              organizationId:
                c.selectedMessageParty?.organizationId ||
                c.emailSelectedParty?.organizationId ||
                c.emailActiveParty?.organizationId ||
                null,
            }, { seedWhenEmpty: false });
            return;
          }
          case "chat":
            await c.patchChatConversation({ contactId: null });
            return;
          case "none":
            return;
        }
      },

      /** Thread-reported parties: incoming wins per message id. */
      onMessagePartiesChange: (parties: EmailMessagePartyMap) => {
        current().setEmailMessageParties((prev) => ({ ...prev, ...parties }));
      },
      onAutoLinkParties: async (parties: EmailMessagePartyMap) => {
        const c = current();
        const next =
          (await patchEmail(c, { messageParties: parties })) ?? parties;
        c.setEmailMessageParties((prev) => ({ ...prev, ...next }));
        return next;
      },
    };
  }, []);
}
