import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ChatUiCardPart } from "@backsteros/contracts";
import {
  assignLeadAndStartProjectChannelConnect,
  ChatMentionResolveProvider,
  ChatUiDevPreview,
  getScopedProjectTaskHref,
  getTaskDisplayId,
  isTaskStatus,
  type ChatSlashProjectConnectHandlers,
  type ChatThreadPeer,
  type LiveAgentChatHandlers,
} from "@backsteros/ui";

import {
  ChatPdfOverlay,
  ChatPdfPageThumb,
} from "../components/chat-pdf-overlay";
import { useAgentMail } from "../lib/agentmail-context";
import { markAgentDmSeen } from "../lib/agent-dm-seen";
import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  useDesktopWorkspacePeople,
  useDesktopWorkspaceTasks,
} from "../lib/workspace-data";
import { openShellChatDeepLink } from "../lib/shell-chat-deep-link";
import { navigateToHref } from "../router/navigate-href";
import { useShellAgentChat } from "./use-shell-agent-chat";
import { useShellChatProjects } from "./use-shell-chat-projects";

const LETTER_PDF_PATH_RE = /^\/api\/v1\/letters\/([^/]+)\/pdf\/?$/i;

function attachmentUrlPath(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  }
  return url;
}

function markLatestAssistantSeen(thread: {
  id: string;
  messages: ReadonlyArray<{ id: string; role: string }>;
}): void {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (message?.role === "assistant") {
      markAgentDmSeen(thread.id, message.id);
      return;
    }
  }
}

/**
 * Persistent shell-level ChatThread host. Mounted once outside routed content
 * so scroll, draft, peer/project selection, and running state survive navigation.
 *
 * OS-155: only agents with a webhook URL appear in the roster.
 */
export function ShellChatPanel() {
  const navigate = useNavigate();
  const { client } = useDesktopApi();
  const { contacts } = useDesktopWorkspacePeople();
  const { allTasks } = useDesktopWorkspaceTasks();
  const { projects, applyChannelOverlay } = useShellChatProjects();
  const agentChat = useShellAgentChat();
  const agentMail = useAgentMail();
  const [pdfOverlay, setPdfOverlay] = useState<{
    url: string;
    filename: string;
  } | null>(null);

  const onNavigate = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
  );

  const webhookContacts = useMemo(() => {
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    const ordered: typeof contacts = [];
    for (const agent of agentChat.webhookReadyAgents) {
      const contactId = agent.contactId?.trim();
      if (!contactId) continue;
      const contact = byId.get(contactId);
      if (contact) ordered.push(contact);
    }
    return ordered;
  }, [agentChat.webhookReadyAgents, contacts]);

  // Same roster as project page Lead agent (any enabled local persona).
  const leadAgentContacts = useMemo(() => {
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    const ordered: typeof contacts = [];
    const seen = new Set<string>();
    for (const agent of agentChat.agents) {
      const contactId = agent.contactId?.trim();
      if (!contactId || seen.has(contactId)) continue;
      seen.add(contactId);
      const contact = byId.get(contactId);
      if (contact) ordered.push(contact);
    }
    return ordered;
  }, [agentChat.agents, contacts]);

  const leadAgentAvatarContacts = useMemo(() => {
    const byId = new Map<string, (typeof contacts)[number]>();
    for (const contact of webhookContacts) byId.set(contact.id, contact);
    for (const contact of leadAgentContacts) byId.set(contact.id, contact);
    return [...byId.values()];
  }, [leadAgentContacts, webhookContacts]);

  // Mailbox-linked contacts for email-draft From / sign-off avatars (same as
  // Messages compose). Include them in the avatar map so switching From updates
  // the footer photo.
  const mailboxContacts = useMemo(() => {
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    const ordered: typeof contacts = [];
    const seen = new Set<string>();
    for (const mailbox of agentMail.mailboxes) {
      const contactId = mailbox.contactId?.trim();
      if (!contactId || seen.has(contactId)) continue;
      seen.add(contactId);
      const contact = byId.get(contactId);
      if (contact) ordered.push(contact);
    }
    return ordered;
  }, [agentMail.mailboxes, contacts]);

  const avatarContacts = useMemo(() => {
    const byId = new Map<string, (typeof contacts)[number]>();
    for (const contact of leadAgentAvatarContacts) byId.set(contact.id, contact);
    for (const contact of mailboxContacts) byId.set(contact.id, contact);
    return [...byId.values()];
  }, [leadAgentAvatarContacts, mailboxContacts]);

  const avatarSrcById = useDesktopAvatarSrcMap("contact", avatarContacts);

  const projectChannelConnect =
    useMemo((): ChatSlashProjectConnectHandlers => {
      return {
        agentContacts: leadAgentContacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          firstName: contact.firstName ?? null,
          lastName: contact.lastName ?? null,
          title: contact.title ?? null,
          email: contact.email ?? null,
          avatarSrc: avatarSrcById[contact.id] ?? contact.avatarSrc ?? null,
        })),
        avatarSrcById,
        onOpenPendingLink: (href) => {
          openShellChatDeepLink(href, { requirePendingForm: true });
        },
        onCreateChannel: async (projectId, leadAgentContactId) => {
          // Optimistic Connecting… only — do not PATCH connecting (server forbids it).
          applyChannelOverlay(projectId, {
            channelStatus: "connecting",
            channelPendingLink: null,
          });
          try {
            const updated = await assignLeadAndStartProjectChannelConnect(
              (path, init) => client.requestJson(path, init),
              { projectId, leadAgentContactId },
            );
            const uri =
              updated.channel &&
              typeof updated.channel === "object" &&
              typeof (updated.channel as { uri?: unknown }).uri === "string"
                ? (updated.channel as { uri: string }).uri
                : null;
            applyChannelOverlay(projectId, {
              channelStatus:
                (updated.channelStatus as
                  | "inactive"
                  | "connecting"
                  | "needs_details"
                  | "active"
                  | null
                  | undefined) ?? "connecting",
              channelUri: uri,
              channelPendingLink: updated.channelPendingLink ?? null,
            });
          } catch (err) {
            applyChannelOverlay(projectId, {
              channelStatus: "inactive",
              channelPendingLink: null,
            });
            throw err;
          }
        },
      };
    }, [applyChannelOverlay, avatarSrcById, client, leadAgentContacts]);

  const emailDraftCompose = useMemo(
    () => ({
      mailboxes: agentMail.mailboxes.map((mailbox) => ({
        ...mailbox,
        avatarSrc: mailbox.contactId
          ? (avatarSrcById[mailbox.contactId] ?? null)
          : (mailbox.avatarSrc ?? null),
      })),
      replyTemplates: agentMail.replyTemplates,
    }),
    [agentMail.mailboxes, agentMail.replyTemplates, avatarSrcById],
  );

  const peers = useMemo((): readonly ChatThreadPeer[] => {
    return webhookContacts.map((contact) => ({
      id: contact.id,
      kind: "contact" as const,
      name: contact.name,
      avatarSrc: avatarSrcById[contact.id] ?? contact.avatarSrc ?? null,
    }));
  }, [avatarSrcById, webhookContacts]);

  const resolveAttachmentUrl = useCallback(
    async (url: string) => {
      const path = attachmentUrlPath(url);
      const letterMatch = path.match(LETTER_PDF_PATH_RE);
      if (letterMatch?.[1]) {
        // Letter PDFs are local-core only (cloud returns pdf_requires_local_core).
        const blob = await client.downloadLetterPdf(
          decodeURIComponent(letterMatch[1]),
        );
        return URL.createObjectURL(blob);
      }
      return agentChat.resolveAttachmentUrl(url);
    },
    [agentChat, client],
  );

  const liveAgentChat = useMemo((): LiveAgentChatHandlers => {
    const agentIdByContactId = new Map<string, string>();
    for (const [contactId, agent] of agentChat.agentsByContactId) {
      agentIdByContactId.set(contactId, agent.id);
    }
    return {
      agentIdByContactId,
      openThread: async (agentId) => {
        const thread = await agentChat.openThread(agentId);
        markLatestAssistantSeen(thread);
        return thread;
      },
      sendMessage: agentChat.sendMessage,
      uploadAttachment: agentChat.uploadAttachment,
      resolveAttachmentUrl,
      openPdfAttachment: (url, filename) => {
        setPdfOverlay({ url, filename });
      },
      renderPdfThumb: (url, filename) => (
        <ChatPdfPageThumb fileUrl={url} filename={filename} />
      ),
      getThread: async (threadId) => {
        const thread = await agentChat.getThread(threadId);
        markLatestAssistantSeen(thread);
        return thread;
      },
      deleteMessages: agentChat.deleteMessages,
      answerChoices: agentChat.answerChoices,
      answerApproval: agentChat.answerApproval,
      answerForm: agentChat.answerForm,
      answerEmailDraft: agentChat.answerEmailDraft,
    };
  }, [agentChat, resolveAttachmentUrl]);

  // Resolve [@task:OS-144] against workspace rows (not only the mention catalog).
  const mentionResolve = useMemo(() => {
    const byKey = new Map<string, ChatUiCardPart>();
    for (const task of allTasks) {
      if (!isTaskStatus(task.status)) continue;
      const displayId = getTaskDisplayId(task);
      if (!displayId) continue;
      const href = task.projectKey
        ? getScopedProjectTaskHref(task.projectKey, task.number)
        : undefined;
      const dueMs =
        task.dueDate instanceof Date
          ? task.dueDate.getTime()
          : typeof task.dueDate === "number"
            ? task.dueDate
            : null;
      byKey.set(`task:${displayId.toLowerCase()}`, {
        type: "card",
        cardType: "task",
        id: `task-ws-${task.id}`,
        data: {
          taskId: task.id,
          displayId,
          title: task.title,
          href,
          status: task.status,
          priority: task.priority,
          dueDate: dueMs,
          projectName: task.projectName ?? null,
          description: null,
        },
      });
    }
    return {
      resolveByKey: (dedupeKey: string) =>
        byKey.get(dedupeKey.trim().toLowerCase()) ?? null,
    };
  }, [allTasks]);

  return (
    <ChatMentionResolveProvider value={mentionResolve}>
      <ChatUiDevPreview
        peers={peers}
        projects={projects}
        onNavigate={onNavigate}
        liveAgentChat={liveAgentChat}
        allowEmptyPeers
        peersLoading={
          agentChat.agentsLoading && agentChat.webhookReadyAgents.length === 0
        }
        webhookSetupHref="/settings/api?type=agent"
        webhookSetupMessage={agentChat.agentsLoadError}
        emailDraftCompose={emailDraftCompose}
        projectChannelConnect={projectChannelConnect}
      />
      {pdfOverlay ? (
        <ChatPdfOverlay
          fileUrl={pdfOverlay.url}
          filename={pdfOverlay.filename}
          onClose={() => setPdfOverlay(null)}
        />
      ) : null}
    </ChatMentionResolveProvider>
  );
}
