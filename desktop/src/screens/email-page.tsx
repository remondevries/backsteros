import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  AgentMailDraftDetail,
  AgentMailMessageDetail,
  EmailSendDraftResponse,
  EmailThreadComment,
  EmailThreadMetadata,
  Task as ApiTask,
} from "@backsteros/contracts";
import {
  EmailDraftActions,
  EmailComposeChrome,
  RegisterPageTitle,
  RegisterEntityDeleteAction,
  RegisterEntityMenuItems,
  EmailThreadMessageCard,
  EmailThreadCommentBubble,
  EmailThreadCommentComposer,
  EmailThreadMinimap,
  TaskMentionBlockChip,
  deriveEmailThreadMinimapItems,
  resolveEmailThreadMinimapHasPersistentGutter,
  resolveEmailThreadMinimapHitStripWidth,
  type EmailThreadMinimapItem,
  getEmailComposeHref,
  getEmailItemHref,
  getEmailListContext,
  getScopedProjectSectionHref,
  preserveEmailInboxListContext,
  EmailPropertiesDisplay,
  EMAIL_PROPERTIES_PANEL_WIDTH_KEY,
  ResizableSidePanel,
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  formatTaskDisplayId,
  INBOX_TASK_KEY,
  isTaskPriority,
  isTaskStatus,
  migrateLegacyTaskStatus,
  emailMailboxFromDisplay,
  isEmailComposePath,
  parseReplyToAddress,
  replySubject as formatReplySubject,
  resolveDuplicatedTaskHref,
  useMentionCatalogOptional,
  SegmentedPillToggle,
  emailMessageBody,
  emailMessageHtmlBody,
  resolveEmailInlineAttachments,
  type EmailMessageSourceDetail,
  type EmailThreadBodyViewMode,
  type TaskPriority,
  type TaskStatus,
  type EmailDraftBodyMode,
  type EntityExtraMenuItem,
  useEmailDraftBodyModeShortcuts,
} from "@backsteros/ui";
import { parseEmailDraftPath } from "@backsteros/ui";

import { DesktopEmailComposeLayout } from "../components/desktop-email-compose-layout";
import {
  emailAgentTaskId,
  emailComposeAgentTaskId,
  extractAgentReplyBody,
  formatEmailAgentTaskCardComment,
  parseEmailAgentTaskCard,
  resolveEditableEmailDraftBody,
  type EmailAgentCreateTaskSpec,
  type EmailAgentTaskCardPayload,
} from "../lib/agent/email-agent-prompt";
import { useEmailThreadCommentAgent } from "../lib/agent/use-email-thread-comment-agent";
import { useDesktopApi } from "../lib/api-context";
import {
  fetchInlineAttachmentBlob,
  peekInlineAttachmentBlob,
  prefetchInlineAttachmentBlob,
} from "../lib/email-inline-attachment-cache.js";
import { createRequestAbortSignal } from "../lib/request-timeout";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { useAgentMail } from "../lib/agentmail-context";
import {
  dispatchEmailListPatch,
  dispatchEmailListRemove,
  EMAIL_INBOX_UPDATED_EVENT,
  type EmailInboxUpdatedDetail,
} from "../lib/use-agentmail-mailboxes";
import {
  discardEmailMessageDetailCache,
  fetchEmailDraftDetail,
  fetchEmailMessageDetail,
  peekEmailDraftDetailCache,
  peekEmailMessageDetailCache,
  writeEmailDraftDetailCache,
  writeEmailMessageDetailCache,
} from "../lib/email-message-detail-cache";
import {
  readEmailComposeSession,
  resetEmailComposeSession,
  writeEmailComposeSession,
} from "../lib/email-compose-session";

function resolveEmailThreadKey(message: AgentMailMessageDetail): string {
  return message.threadId?.trim() || message.messageId.trim();
}

function requestMailboxReload() {
  window.dispatchEvent(new CustomEvent("backsteros-email-mailboxes-reload"));
}

const EMAIL_THREAD_BODY_VIEW_MODE_KEY = "backsteros:email-thread-body-view-mode";

function readEmailThreadBodyViewMode(): EmailThreadBodyViewMode {
  try {
    const raw = window.localStorage.getItem(EMAIL_THREAD_BODY_VIEW_MODE_KEY);
    return raw === "rendered" || raw === "source" ? raw : "plain";
  } catch {
    return "plain";
  }
}

function dueDateMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function resolveAgentTaskMentionChip(
  card: EmailAgentTaskCardPayload,
  catalogTasks: readonly {
    id: string;
    displayId: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: number | null;
    projectName: string | null;
    projectIcon: string | null;
  }[],
): {
  href: string;
  task: {
    displayId: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: number | null;
    projectName: string | null;
    projectIcon: string | null;
  };
} {
  const live = catalogTasks.find((entry) => entry.id === card.taskId) ?? null;
  if (live) {
    return { href: card.href, task: live };
  }

  const displayId =
    card.displayId?.trim() ||
    (card.projectKey && card.number != null
      ? formatTaskDisplayId(card.projectKey, card.number)
      : card.number != null
        ? formatTaskDisplayId(INBOX_TASK_KEY, card.number)
        : card.title);
  const statusRaw = card.status?.trim() || "triage";
  const status = isTaskStatus(statusRaw)
    ? statusRaw
    : migrateLegacyTaskStatus(statusRaw);
  const priority =
    card.priority != null && isTaskPriority(card.priority)
      ? card.priority
      : 0;

  return {
    href: card.href,
    task: {
      displayId,
      title: card.title,
      status: isTaskStatus(status) ? status : "triage",
      priority,
      dueDate: dueDateMs(card.dueDate),
      projectName: card.projectName ?? null,
      projectIcon: card.projectIcon ?? null,
    },
  };
}

export function EmailPage() {
  const params = useParams<{
    inboxId?: string;
    messageId?: string;
    draftId?: string;
  }>();
  const location = useLocation();
  const locationPath = location.pathname;
  const isCompose = isEmailComposePath(locationPath);
  const draftPath = parseEmailDraftPath(locationPath);
  const inboxId = draftPath?.inboxId ?? params.inboxId;
  const messageId = draftPath ? undefined : params.messageId;
  const draftId = draftPath?.draftId ?? params.draftId;

  const { client } = useDesktopApi();
  const fetchInlineAttachment = useCallback(
    (messageInboxId: string, messageRowId: string, attachmentId: string) =>
      fetchInlineAttachmentBlob(
        client,
        messageInboxId,
        messageRowId,
        attachmentId,
      ),
    [client],
  );
  const peekInlineAttachment = useCallback(
    (messageInboxId: string, messageRowId: string, attachmentId: string) =>
      peekInlineAttachmentBlob(messageInboxId, messageRowId, attachmentId),
    [],
  );
  const navigate = useNavigate();
  const toEmailDetailHref = useCallback(
    (targetInboxId: string, targetMessageId: string) =>
      preserveEmailInboxListContext(
        getEmailItemHref(targetInboxId, targetMessageId),
        location.search,
      ),
    [location.search],
  );
  // Shared Provider owns list fetch + SSE; detail only needs mailboxes.
  const agentMail = useAgentMail();
  const workspace = useDesktopWorkspaceData();
  const { organizations, contacts, projects } = workspace;
  const mentionCatalog = useMentionCatalogOptional()?.catalog;
  const initialCachedMessage =
    inboxId && messageId && !draftId
      ? peekEmailMessageDetailCache(inboxId, messageId)
      : null;
  const initialCachedDraft =
    inboxId && draftId ? peekEmailDraftDetailCache(inboxId, draftId) : null;
  const [message, setMessage] = useState<AgentMailMessageDetail | null>(
    initialCachedMessage,
  );
  const [draft, setDraft] = useState<AgentMailDraftDetail | null>(
    initialCachedDraft,
  );
  const [loading, setLoading] = useState(
    Boolean(inboxId && (messageId || draftId)) &&
      !initialCachedMessage &&
      !initialCachedDraft,
  );
  const [error, setError] = useState<string | null>(null);
  const [conceptError, setConceptError] = useState<string | null>(null);
  const [conceptSaving, setConceptSaving] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusOverride, setStatusOverride] = useState<TaskStatus | null>(null);
  const [priorityOverride, setPriorityOverride] = useState<number | null>(null);
  const [dueDateOverride, setDueDateOverride] = useState<Date | null | undefined>(
    undefined,
  );
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [conceptBodyDraft, setConceptBodyDraft] = useState("");
  const [conceptBodyMode, setConceptBodyMode] =
    useState<EmailDraftBodyMode>("preview");
  const [conceptBodySaving, setConceptBodySaving] = useState(false);
  const [draftStageWorking, setDraftStageWorking] = useState(false);
  const conceptSavingRef = useRef(false);
  const conceptBodySavingRef = useRef(false);
  const sendingRef = useRef(false);
  const deletingRef = useRef(false);
  const [composeSession] = useState(() => readEmailComposeSession());
  const [composeInboxId, setComposeInboxId] = useState(
    () => composeSession.inboxId ?? "",
  );
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeDraft, setComposeDraft] = useState<AgentMailDraftDetail | null>(
    null,
  );
  const [composeLoading, setComposeLoading] = useState(
    Boolean(isCompose && composeSession.draftId && composeSession.inboxId),
  );
  const [replyComposeOpen, setReplyComposeOpen] = useState(false);
  const [replyInboxId, setReplyInboxId] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [replySubjectText, setReplySubjectText] = useState("");
  const [threadComments, setThreadComments] = useState<EmailThreadComment[]>(
    [],
  );
  const [commentSending, setCommentSending] = useState(false);
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(
    null,
  );
  const [freshCommentIds, setFreshCommentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [threadBodyViewMode, setThreadBodyViewMode] =
    useState<EmailThreadBodyViewMode>(() => readEmailThreadBodyViewMode());
  const [workingEnter, setWorkingEnter] = useState(false);
  const [propertiesRailWidth, setPropertiesRailWidth] = useState(300);
  const [minimapHasPersistentGutter, setMinimapHasPersistentGutter] =
    useState(false);
  const [minimapHitStripWidth, setMinimapHitStripWidth] = useState(0);
  const [minimapInViewIds, setMinimapInViewIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const propertiesRailRef = useRef<HTMLElement | null>(null);
  const threadScrollShellRef = useRef<HTMLDivElement | null>(null);
  const threadScrollportRef = useRef<HTMLDivElement | null>(null);
  const previousCommentIdsRef = useRef<string[] | null>(null);
  const didInitialThreadScrollRef = useRef(false);
  const wasReplyChromeVisibleRef = useRef(false);
  const followEndCleanupRef = useRef<(() => void) | null>(null);
  const previousDraftFingerprintRef = useRef("");
  const previousThreadMessageCountRef = useRef(0);

  useEffect(() => {
    const el = propertiesRailRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const width = Math.round(el.getBoundingClientRect().width);
      if (width > 0) setPropertiesRailWidth(width);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [messageId]);

  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );

  const organizationOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        withAvatarSrc(organizations, organizationAvatarSrc),
      ),
    [organizationAvatarSrc, organizations],
  );

  const contactOptions = useMemo(
    () =>
      buildContactDropdownOptions(
        withAvatarSrc(contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, contacts],
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, contacts],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
        })),
      ),
    [projects],
  );

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

  useEffect(() => {
    const editableBody =
      resolveEditableEmailDraftBody(draft) ||
      resolveEditableEmailDraftBody(message?.conceptDraft);
    setConceptBodyDraft(editableBody);
    setConceptBodyMode("preview");
  }, [
    draft?.draftId,
    draft?.updatedAt,
    draft?.body,
    draft?.text,
    message?.messageId,
    message?.conceptDraft?.updatedAt,
    message?.conceptDraft?.body,
    message?.conceptDraft?.text,
  ]);

  useEffect(() => {
    setReplyComposeOpen(false);
    setReplyInboxId("");
    setReplyTo("");
    setReplySubjectText("");
  }, [messageId]);

  useEffect(() => {
    setThreadComments(message?.threadComments ?? []);
  }, [message?.messageId, message?.threadComments]);

  const messageWithComments = useMemo(() => {
    if (!message) return null;
    return { ...message, threadComments };
  }, [message, threadComments]);

  useEffect(() => {
    if (!message || isCompose) return;
    if (message.conceptDraft) {
      setReplyComposeOpen(true);
      setReplyInboxId(message.conceptDraft.inboxId?.trim() || inboxId || "");
      setReplyTo(
        message.conceptDraft.to?.[0]?.trim() ||
          parseReplyToAddress(message.from),
      );
      setReplySubjectText(
        message.conceptDraft.subject?.trim() ||
          formatReplySubject(message.subject),
      );
    }
  }, [
    inboxId,
    isCompose,
    message,
    message?.conceptDraft,
    message?.from,
    message?.messageId,
    message?.subject,
  ]);

  useEffect(() => {
    if (!isCompose || agentMail.mailboxes.length === 0) return;
    setComposeInboxId((current) => {
      if (current && agentMail.mailboxes.some((mailbox) => mailbox.inboxId === current)) {
        return current;
      }
      const fromSession = composeSession.inboxId?.trim();
      if (
        fromSession &&
        agentMail.mailboxes.some((mailbox) => mailbox.inboxId === fromSession)
      ) {
        return fromSession;
      }
      return agentMail.mailboxes[0]?.inboxId ?? "";
    });
  }, [agentMail.mailboxes, composeSession.inboxId, isCompose]);

  useEffect(() => {
    if (!isCompose) return;
    const draftId = composeSession.draftId?.trim();
    const sessionInboxId = composeSession.inboxId?.trim();
    if (!draftId || !sessionInboxId) {
      setComposeLoading(false);
      return;
    }
    const controller = new AbortController();
    const signal = createRequestAbortSignal(undefined, controller.signal);
    let cancelled = false;
    setComposeLoading(true);
    void client
      .requestJson<AgentMailDraftDetail>(
        `/api/v1/email/inboxes/${encodeURIComponent(sessionInboxId)}/drafts/${encodeURIComponent(draftId)}`,
        { signal },
      )
      .then((loaded) => {
        if (cancelled) return;
        setComposeDraft(loaded);
        setComposeTo(loaded.to[0]?.trim() ?? "");
        setComposeSubject(loaded.subject?.trim() ?? "");
        setConceptBodyDraft(resolveEditableEmailDraftBody(loaded));
      })
      .catch(() => {
        if (cancelled) return;
        setComposeDraft(null);
      })
      .finally(() => {
        if (!cancelled) setComposeLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, composeSession.draftId, composeSession.inboxId, isCompose]);

  useEffect(() => {
    if (!isCompose) return;
    setConceptBodyDraft(resolveEditableEmailDraftBody(composeDraft));
    setConceptBodyMode("preview");
  }, [
    composeDraft?.draftId,
    composeDraft?.updatedAt,
    composeDraft?.body,
    composeDraft?.text,
    isCompose,
  ]);

  // One-shot compose prefill (Forward) — apply then clear from the session.
  // Declared after the body-reset effect so the prefilled body survives mount.
  useEffect(() => {
    if (!isCompose) return;
    const prefill = composeSession.prefill;
    if (!prefill) return;
    if (prefill.to?.trim()) setComposeTo(prefill.to.trim());
    if (prefill.subject?.trim()) setComposeSubject(prefill.subject.trim());
    if (prefill.body?.trim()) setConceptBodyDraft(prefill.body);
    writeEmailComposeSession({
      sessionId: composeSession.sessionId,
      draftId: composeSession.draftId,
      inboxId: composeSession.inboxId,
      prefill: null,
    });
  }, [composeSession, isCompose]);

  const reloadMessageDetail = useCallback(
    async (messageInboxId: string, reloadMessageId: string) => {
      const detail = await fetchEmailMessageDetail(
        client,
        messageInboxId,
        reloadMessageId,
        { force: true },
      );
      if (!detail) {
        throw new Error("Could not reload message.");
      }
      return detail;
    },
    [client],
  );

  // Keep the open thread in sync when AgentMail delivers mail (SSE) or when
  // the side-panel poll is the only live path (SSE dropped).
  useEffect(() => {
    if (!inboxId || !messageId || isCompose) return;
    const detailFingerprint = (detail: AgentMailMessageDetail) =>
      [
        detail.messageId,
        detail.timestamp ?? "",
        detail.conceptDraftId ?? "",
        detail.conceptDraft?.updatedAt ?? "",
        detail.threadComments?.length ?? 0,
        detail.threadMessages
          ?.map(
            (entry) =>
              `${entry.messageId}:${(entry.attachments ?? [])
                .map((attachment) => attachment.attachmentId)
                .join(",")}`,
          )
          .join("|") ?? "",
        detail.threadMetadata?.status ?? "",
        detail.threadMetadata?.priority ?? "",
        detail.threadMetadata?.dueDate ?? "",
        detail.threadMetadata?.projectId ?? "",
        detail.threadMetadata?.assigneeId ?? "",
        detail.threadMetadata?.contactId ?? "",
        detail.threadMetadata?.organizationId ?? "",
      ].join("|");
    let lastFingerprint = "";
    const refreshOpenThread = () => {
      void reloadMessageDetail(inboxId, messageId)
        .then((reloaded) => {
          const nextFingerprint = detailFingerprint(reloaded);
          if (nextFingerprint === lastFingerprint) return;
          lastFingerprint = nextFingerprint;
          setMessage(reloaded);
        })
        .catch(() => {});
    };
    const onInboxUpdated = (event: Event) => {
      const detail = (event as CustomEvent<EmailInboxUpdatedDetail>).detail;
      if (!detail?.inboxId || detail.inboxId !== inboxId) return;
      refreshOpenThread();
    };
    window.addEventListener(EMAIL_INBOX_UPDATED_EVENT, onInboxUpdated);
    const timer = window.setInterval(refreshOpenThread, 15_000);
    return () => {
      window.removeEventListener(EMAIL_INBOX_UPDATED_EVENT, onInboxUpdated);
      window.clearInterval(timer);
    };
  }, [inboxId, isCompose, messageId, reloadMessageDetail]);

  useEffect(() => {
    if (isCompose) return;
    if (!inboxId || (!messageId && !draftId)) {
      setMessage(null);
      setDraft(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const cachedMessage =
      messageId && !draftId
        ? peekEmailMessageDetailCache(inboxId, messageId)
        : null;
    const cachedDraft = draftId
      ? peekEmailDraftDetailCache(inboxId, draftId)
      : null;

    if (cachedMessage) {
      setMessage(cachedMessage);
      setDraft(null);
      setLoading(false);
    } else if (cachedDraft) {
      setDraft(cachedDraft);
      setMessage(null);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    const load = draftId
      ? fetchEmailDraftDetail(client, inboxId, draftId)
      : messageId
        ? fetchEmailMessageDetail(
            client,
            inboxId,
            messageId,
            cachedMessage ? { force: true } : undefined,
          )
        : Promise.resolve(null);

    void load
      .then((body) => {
        if (cancelled) return;
        if (!body) {
          if (!cachedMessage && !cachedDraft) {
            setMessage(null);
            setDraft(null);
            setError("Could not load email.");
          }
          return;
        }
        if (draftId) {
          setDraft(body as AgentMailDraftDetail);
          setMessage(null);
        } else {
          setMessage(body as AgentMailMessageDetail);
          setDraft(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, draftId, inboxId, isCompose, messageId]);

  useEffect(() => {
    if (!message || isCompose) return;
    const resolvedInboxId = (inboxId || message.inboxId)?.trim();
    if (!resolvedInboxId) return;
    const rows =
      message.threadMessages && message.threadMessages.length > 0
        ? message.threadMessages
        : [
            {
              messageId: message.messageId,
              html: message.html,
              extractedHtml: message.extractedHtml,
              extractedText: message.extractedText,
              text: message.text,
              attachments: message.attachments,
            },
          ];
    for (const entry of rows) {
      const html = emailMessageHtmlBody(entry);
      if (!html) continue;
      const inlineAttachments = (entry.attachments ?? []).map((attachment) => ({
        attachmentId: attachment.attachmentId,
        contentId: attachment.contentId ?? null,
      }));
      for (const attachment of resolveEmailInlineAttachments(
        inlineAttachments,
        html,
      )) {
        prefetchInlineAttachmentBlob(
          client,
          resolvedInboxId,
          entry.messageId,
          attachment.attachmentId,
        );
      }
    }
  }, [client, inboxId, isCompose, message]);

  useEffect(() => {
    if (message && inboxId && messageId) {
      writeEmailMessageDetailCache(inboxId, messageId, message);
    }
  }, [inboxId, message, messageId]);

  useEffect(() => {
    if (draft && inboxId && draftId) {
      writeEmailDraftDetailCache(inboxId, draftId, draft);
    }
  }, [draft, draftId, inboxId]);

  const taskId = useMemo(() => {
    if (!inboxId || !messageId) return null;
    return emailAgentTaskId(inboxId, messageId);
  }, [inboxId, messageId]);

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

  const saveConceptDraftBody = useCallback(
    async (targetInboxId: string, targetDraftId: string, body: string) => {
      if (conceptBodySavingRef.current) return;
      conceptBodySavingRef.current = true;
      setConceptBodySaving(true);
      setConceptError(null);
      try {
        const updated = await client.requestJson<AgentMailDraftDetail>(
          `/api/v1/email/inboxes/${encodeURIComponent(targetInboxId)}/drafts/${encodeURIComponent(targetDraftId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
          },
        );
        if (draftId && draft) {
          setDraft(updated);
        } else if (composeDraft?.draftId) {
          setComposeDraft(updated);
        } else if (messageId && inboxId) {
          const reloaded = await reloadMessageDetail(inboxId, messageId);
          setMessage(reloaded);
        }
        setConceptBodyDraft(
          resolveEditableEmailDraftBody(updated) || body,
        );
        requestMailboxReload();
      } catch (caught) {
        const messageText =
          caught instanceof Error
            ? caught.message
            : "Could not save draft changes.";
        setConceptError(messageText);
        throw caught;
      } finally {
        conceptBodySavingRef.current = false;
        setConceptBodySaving(false);
      }
    },
    [client, composeDraft?.draftId, draft, draftId, inboxId, messageId, reloadMessageDetail],
  );

  const handleConceptBodyModeChange = useCallback(
    async (mode: EmailDraftBodyMode) => {
      if (mode === conceptBodyMode) return;
      if (mode === "preview" && conceptBodyMode === "edit") {
        const savedBody = resolveEditableEmailDraftBody(draft)
          || resolveEditableEmailDraftBody(message?.conceptDraft);
        if (conceptBodyDraft !== savedBody) {
          const targetInboxId =
            draft?.inboxId ??
            composeDraft?.inboxId ??
            message?.conceptDraft?.inboxId ??
            inboxId ??
            "";
          const targetDraftId =
            draft?.draftId ??
            composeDraft?.draftId ??
            message?.conceptDraft?.draftId ??
            message?.conceptDraftId ??
            "";
          if (targetInboxId && targetDraftId) {
            try {
              await saveConceptDraftBody(
                targetInboxId,
                targetDraftId,
                conceptBodyDraft,
              );
            } catch {
              return;
            }
          }
        }
      }
      setConceptBodyMode(mode);
    },
    [
      conceptBodyDraft,
      conceptBodyMode,
      composeDraft,
      draft,
      inboxId,
      message,
      saveConceptDraftBody,
    ],
  );

  const saveConceptReply = useCallback(
    async (body: string) => {
      if (!inboxId || !messageId || conceptSavingRef.current) return;
      const agentBody = extractAgentReplyBody(body) || body.trim();
      if (!agentBody.trim()) return;
      setConceptBodyDraft(agentBody);
      conceptSavingRef.current = true;
      setConceptSaving(true);
      setConceptError(null);
      try {
        const saved = await client.requestJson<{
          draftId: string;
          inboxId: string;
          inReplyToMessageId?: string | null;
        }>(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/concept-reply`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: agentBody }),
          },
        );
        try {
          const reloaded = await client.requestJson<AgentMailMessageDetail>(
            `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
          );
          setMessage(reloaded);
          if (!reloaded.conceptDraft && saved.draftId) {
            // Reload missed the draft link — fetch it directly so navigation
            // away/back still has a draft id in local state until list catches up.
            try {
              const draftDetail = await client.requestJson<AgentMailDraftDetail>(
                `/api/v1/email/inboxes/${encodeURIComponent(saved.inboxId || inboxId)}/drafts/${encodeURIComponent(saved.draftId)}`,
              );
              setMessage({
                ...reloaded,
                conceptDraftId: draftDetail.draftId,
                conceptDraft: {
                  draftId: draftDetail.draftId,
                  inboxId: draftDetail.inboxId || saved.inboxId || inboxId,
                  subject: draftDetail.subject,
                  from: draftDetail.from ?? null,
                  to: draftDetail.to ?? [],
                  text: draftDetail.text,
                  body: resolveEditableEmailDraftBody(draftDetail),
                  greeting: draftDetail.greeting ?? null,
                  signOff: draftDetail.signOff ?? null,
                  preview: draftDetail.preview,
                  updatedAt: draftDetail.updatedAt,
                },
              });
            } catch (draftError) {
              console.warn("[email] concept draft fetch failed:", draftError);
            }
          }
        } catch (reloadError) {
          // Draft was saved — don't surface a reload-only failure as the
          // primary error (e.g. transient AgentMail draft lookup races).
          console.warn("[email] concept-reply reload failed:", reloadError);
        }
        requestMailboxReload();
      } catch (caught) {
        const messageText =
          caught instanceof Error
            ? caught.message
            : "Could not save reply concept.";
        setConceptError(messageText);
        console.warn("[email] concept-reply failed:", caught);
      } finally {
        conceptSavingRef.current = false;
        setConceptSaving(false);
      }
    },
    [client, inboxId, messageId],
  );

  const saveComposeDraft = useCallback(
    async (body: string) => {
      if (!composeInboxId || conceptSavingRef.current) return;
      if (!composeTo.trim()) {
        setConceptError("Enter a recipient before drafting.");
        return;
      }
      const agentBody = extractAgentReplyBody(body) || body.trim();
      if (!agentBody.trim()) return;
      setConceptBodyDraft(agentBody);
      conceptSavingRef.current = true;
      setConceptSaving(true);
      setConceptError(null);
      try {
        const result = await client.requestJson<{
          draftId: string;
          inboxId: string;
          composeSessionId: string;
        }>(
          `/api/v1/email/inboxes/${encodeURIComponent(composeInboxId)}/compose-draft`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: composeTo.trim(),
              subject: composeSubject.trim(),
              body: agentBody,
              composeSessionId: composeSession.sessionId,
            }),
          },
        );
        writeEmailComposeSession({
          sessionId: result.composeSessionId,
          draftId: result.draftId,
          inboxId: result.inboxId,
        });
        const loaded = await client.requestJson<AgentMailDraftDetail>(
          `/api/v1/email/inboxes/${encodeURIComponent(result.inboxId)}/drafts/${encodeURIComponent(result.draftId)}`,
        );
        setComposeDraft(loaded);
        setComposeSubject(loaded.subject?.trim() ?? composeSubject);
        setConceptBodyDraft(
          resolveEditableEmailDraftBody(loaded) || agentBody,
        );
        requestMailboxReload();
      } catch (caught) {
        const messageText =
          caught instanceof Error
            ? caught.message
            : "Could not save compose draft.";
        setConceptError(messageText);
        console.warn("[email] compose-draft failed:", caught);
      } finally {
        conceptSavingRef.current = false;
        setConceptSaving(false);
      }
    },
    [
      client,
      composeInboxId,
      composeSession.sessionId,
      composeSubject,
      composeTo,
    ],
  );

  const sendDraft = useCallback(
    async (
      draftInboxId: string,
      targetDraftId: string,
      reloadMessageId?: string | null,
    ) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      setSendError(null);
      try {
        const result = await client.requestJson<EmailSendDraftResponse>(
          `/api/v1/email/inboxes/${encodeURIComponent(draftInboxId)}/drafts/${encodeURIComponent(targetDraftId)}/send`,
          { method: "POST" },
        );
        requestMailboxReload();
        const returnToMessageId =
          reloadMessageId?.trim() ||
          result.inReplyToMessageId?.trim() ||
          result.messageId?.trim() ||
          null;
        if (returnToMessageId && (inboxId || result.inboxId)) {
          const targetInbox = inboxId || result.inboxId;
          promoteEmailThreadStatus("on_hold");
          dispatchEmailListPatch({
            inboxId: targetInbox,
            messageId: returnToMessageId,
            threadId: result.threadId ?? null,
            status: "on_hold",
          });
          const reloaded = await reloadMessageDetail(targetInbox, returnToMessageId);
          setDraft(null);
          setMessage(reloaded);
          if (draftId) {
            navigate(toEmailDetailHref(targetInbox, returnToMessageId), {
              replace: true,
            });
          }
          return;
        }
        setDraft(null);
        setMessage(null);
        setComposeDraft(null);
        resetEmailComposeSession();
        navigate("/inbox", { replace: true });
      } catch (caught) {
        setSendError(
          caught instanceof Error ? caught.message : "Could not send draft.",
        );
        console.warn("[email] send draft failed:", caught);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [client, draftId, inboxId, navigate, promoteEmailThreadStatus, reloadMessageDetail, toEmailDetailHref],
  );

  const deleteDraft = useCallback(
    (
      draftInboxId: string,
      targetDraftId: string,
      reloadMessageId?: string | null,
    ) => {
      const resolvedInboxId = draftInboxId.trim();
      const resolvedDraftId = targetDraftId.trim();
      if (!resolvedInboxId || !resolvedDraftId) {
        setSendError("Could not delete draft — missing inbox or draft id.");
        return;
      }
      if (deletingRef.current) return;
      deletingRef.current = true;
      setSendError(null);

      const returnToMessageId = reloadMessageId?.trim() || null;
      const parentMessageId =
        returnToMessageId ||
        message?.messageId?.trim() ||
        messageId?.trim() ||
        null;

      // Optimistic UI — leave / clear immediately; DELETE runs in the background.
      setConceptBodyDraft("");
      setReplyComposeOpen(false);
      setMessage((current) =>
        current
          ? {
              ...current,
              conceptDraft: null,
              conceptDraftId: null,
              conceptPreview: null,
            }
          : null,
      );
      if (parentMessageId) {
        dispatchEmailListPatch({
          inboxId: resolvedInboxId,
          messageId: parentMessageId,
          conceptDraftId: null,
        });
      }

      if (returnToMessageId && inboxId) {
        setDraft(null);
        if (draftId) {
          navigate(toEmailDetailHref(inboxId, returnToMessageId), {
            replace: true,
          });
        }
      } else {
        setDraft(null);
        setMessage(null);
        setComposeDraft(null);
        writeEmailComposeSession({
          sessionId: composeSession.sessionId,
          draftId: null,
          inboxId: composeInboxId || null,
        });
        if (!isCompose) {
          navigate("/inbox", { replace: true });
        }
      }

      deletingRef.current = false;
      setDeleting(false);

      void client
        .requestJson(
          `/api/v1/email/inboxes/${encodeURIComponent(resolvedInboxId)}/drafts/${encodeURIComponent(resolvedDraftId)}`,
          { method: "DELETE" },
        )
        .then(() => {
          if (returnToMessageId && inboxId) {
            void reloadMessageDetail(inboxId, returnToMessageId)
              .then((reloaded) => {
                setMessage(reloaded);
              })
              .catch(() => {
                // Keep optimistic cleared state.
              });
          }
        })
        .catch((caught) => {
          setSendError(
            caught instanceof Error
              ? caught.message
              : "Could not delete draft.",
          );
          console.warn("[email] delete draft failed:", caught);
          requestMailboxReload();
          if (returnToMessageId && inboxId) {
            void reloadMessageDetail(inboxId, returnToMessageId)
              .then((reloaded) => {
                setMessage(reloaded);
              })
              .catch(() => {});
          }
        });
    },
    [
      client,
      composeInboxId,
      composeSession.sessionId,
      draftId,
      inboxId,
      isCompose,
      message?.messageId,
      messageId,
      navigate,
      reloadMessageDetail,
      toEmailDetailHref,
    ],
  );

  const leaveMessageAfterRemoval = useCallback(() => {
    setMessage(null);
    setDraft(null);
    setThreadComments([]);
    navigate("/inbox", { replace: true });
  }, [navigate]);

  const handleDeleteMessage = useCallback(async () => {
    if (!inboxId || !messageId) {
      return { ok: false as const, error: "Message is required." };
    }
    const threadId = message?.threadId?.trim() || null;

    // Optimistic: drop from list + leave detail immediately.
    dispatchEmailListRemove({
      inboxId,
      messageId,
      threadId,
    });
    leaveMessageAfterRemoval();

    void client
      .requestJson(
        `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      )
      .catch((error) => {
        console.warn("[email] delete message failed:", error);
        requestMailboxReload();
      });

    return { ok: true as const };
  }, [
    client,
    inboxId,
    leaveMessageAfterRemoval,
    message?.threadId,
    messageId,
  ]);

  const handleReportSpamMessage = useCallback(
    async (targetMessageId: string) => {
      if (!inboxId || !targetMessageId) {
        return { ok: false as const, error: "Message is required." };
      }
      const threadId = message?.threadId?.trim() || null;

      dispatchEmailListRemove({
        inboxId,
        messageId: targetMessageId,
        threadId,
      });
      leaveMessageAfterRemoval();

      void client
        .requestJson(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(targetMessageId)}/report-spam`,
          { method: "POST" },
        )
        .catch((error) => {
          console.warn("[email] report spam failed:", error);
          requestMailboxReload();
        });

      return { ok: true as const };
    },
    [client, inboxId, leaveMessageAfterRemoval, message?.threadId],
  );

  const handleReportSpam = useCallback(async () => {
    if (!messageId) {
      return { ok: false as const, error: "Message is required." };
    }
    return handleReportSpamMessage(messageId);
  }, [handleReportSpamMessage, messageId]);

  const markMessagesUnread = useCallback(
    (ids: string[]) => {
      if (!inboxId || ids.length === 0) return;
      void Promise.allSettled(
        ids.map((id) =>
          client.requestJson(
            `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(id)}/mark-unread`,
            { method: "POST" },
          ),
        ),
      ).then((results) => {
        const firstFailure = results.find(
          (result) => result.status === "rejected",
        );
        if (firstFailure && firstFailure.status === "rejected") {
          console.warn("[email] mark unread failed:", firstFailure.reason);
        }
        requestMailboxReload();
      });
    },
    [client, inboxId],
  );

  const messageSourceCacheRef = useRef(
    new Map<string, Promise<EmailMessageSourceDetail>>(),
  );
  const loadMessageSource = useCallback(
    (sourceInboxId: string, sourceMessageId: string) => {
      const key = `${sourceInboxId}:${sourceMessageId}`;
      const cache = messageSourceCacheRef.current;
      const existing = cache.get(key);
      if (existing) return existing;
      const promise = client
        .requestJson<{
          messageId: string;
          sizeBytes: number;
          headers: { name: string; value: string }[];
          raw: string;
        }>(
          `/api/v1/email/inboxes/${encodeURIComponent(sourceInboxId)}/messages/${encodeURIComponent(sourceMessageId)}/source`,
        )
        .then((result) => ({
          sizeBytes: result.sizeBytes,
          headers: result.headers,
          raw: result.raw,
        }))
        .catch((error: unknown) => {
          cache.delete(key);
          throw error;
        });
      cache.set(key, promise);
      return promise;
    },
    [client],
  );

  const startForward = useCallback(
    (entry: {
      subject: string;
      from: string;
      to: string[];
      timestamp: string;
      body: string;
    }) => {
      const subjectText = entry.subject.trim() || "(no subject)";
      const forwardSubject = /^fwd:/i.test(subjectText)
        ? subjectText
        : `Fwd: ${subjectText}`;
      const parsedDate = new Date(entry.timestamp);
      const forwardBody = [
        "---------- Forwarded message ----------",
        `From: ${entry.from}`,
        ...(Number.isNaN(parsedDate.getTime())
          ? []
          : [`Date: ${parsedDate.toLocaleString()}`]),
        `Subject: ${subjectText}`,
        ...(entry.to.length > 0 ? [`To: ${entry.to.join(", ")}`] : []),
        "",
        entry.body,
      ].join("\n");
      writeEmailComposeSession({
        sessionId: crypto.randomUUID(),
        draftId: null,
        inboxId: inboxId || message?.inboxId || null,
        prefill: { subject: forwardSubject, body: forwardBody },
      });
      navigate(getEmailComposeHref());
    },
    [inboxId, message?.inboxId, navigate],
  );

  const handleDeleteThreadMessage = useCallback(
    async (targetMessageId: string) => {
      if (!inboxId || !message) {
        return { ok: false as const, error: "Message is required." };
      }

      const threadId = message.threadId?.trim() || null;
      const threadRows =
        message.threadMessages && message.threadMessages.length > 0
          ? message.threadMessages
          : [
              {
                messageId: message.messageId,
                threadId: message.threadId,
                subject: message.subject,
                from: message.from,
                to: message.to ?? (message.inboxEmail ? [message.inboxEmail] : []),
                timestamp: message.timestamp,
                text: message.text,
                html: message.html,
                extractedText: message.extractedText,
                extractedHtml: message.extractedHtml,
                labels: message.labels,
                inReplyTo: message.inReplyToMessageId ?? null,
              },
            ];
      const remaining = threadRows.filter(
        (entry) => entry.messageId !== targetMessageId,
      );
      const threadRemoved = remaining.length === 0;
      const viewingDeletedMessage = messageId === targetMessageId;
      const reconcileMessageId = viewingDeletedMessage
        ? (remaining[0]?.messageId ?? null)
        : messageId;

      setConceptError(null);

      if (threadRemoved) {
        dispatchEmailListRemove({
          inboxId,
          messageId: targetMessageId,
          threadId,
        });
        leaveMessageAfterRemoval();
      } else {
        setMessage((current) => {
          if (!current) return current;
          const currentRows =
            current.threadMessages && current.threadMessages.length > 0
              ? current.threadMessages
              : null;
          if (!currentRows) return current;
          return {
            ...current,
            threadMessages: currentRows.filter(
              (entry) => entry.messageId !== targetMessageId,
            ),
          };
        });
        if (viewingDeletedMessage) {
          const nextId = remaining[0]?.messageId;
          if (nextId) {
            navigate(toEmailDetailHref(inboxId, nextId), { replace: true });
          }
        }
      }

      discardEmailMessageDetailCache(inboxId, targetMessageId);

      void (async () => {
        try {
          const result = await client.requestJson<{
            ok: true;
            threadRemoved: boolean;
            anchorMessageId: string | null;
          }>(
            `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(targetMessageId)}?scope=message`,
            { method: "DELETE" },
          );

          if (result.threadRemoved) {
            requestMailboxReload();
            return;
          }

          const reloadId = viewingDeletedMessage
            ? (result.anchorMessageId ?? remaining[0]?.messageId ?? null)
            : messageId;
          if (reloadId) {
            try {
              const reloaded = await reloadMessageDetail(inboxId, reloadId);
              setMessage(reloaded);
            } catch {
              // Keep optimistic state; mailbox reload will reconcile.
            }
          }
          requestMailboxReload();
        } catch (error) {
          console.warn("[email] delete thread message failed:", error);
          requestMailboxReload();
          if (!threadRemoved && reconcileMessageId) {
            try {
              const reloaded = await reloadMessageDetail(
                inboxId,
                reconcileMessageId,
              );
              setMessage(reloaded);
            } catch {
              // Keep optimistic state; mailbox reload will reconcile.
            }
          }
          setConceptError(
            error instanceof Error ? error.message : "Could not delete email.",
          );
        }
      })();

      return { ok: true as const };
    },
    [
      client,
      inboxId,
      leaveMessageAfterRemoval,
      message,
      messageId,
      navigate,
      reloadMessageDetail,
      toEmailDetailHref,
    ],
  );

  const emailExtraMenuItems = useMemo((): EntityExtraMenuItem[] => {
    if (!message || !inboxId || !messageId) return [];
    const subjectLabel =
      message.subject.trim() || "this conversation";
    return [
      {
        id: "report-spam",
        label: "Report spam",
        danger: true,
        confirm: {
          entityLabel: `${subjectLabel} (entire thread)`,
          confirmLabel: "Report spam",
          actionVerb: "Report spam for",
        },
        onSelect: handleReportSpam,
      },
    ];
  }, [handleReportSpam, inboxId, message, messageId]);

  const commentsApiBase = useCallback(() => {
    if (!inboxId || !message) return null;
    const threadKey = resolveEmailThreadKey(message);
    return `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadKey)}/comments`;
  }, [inboxId, message]);

  const postThreadComment = useCallback(
    async (body: string, author: "user" | "agent") => {
      const base = commentsApiBase();
      if (!base) return null;
      const created = await client.requestJson<EmailThreadComment>(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, author }),
      });
      setThreadComments((current) => [...current, created]);
      return created;
    },
    [client, commentsApiBase],
  );

  const deleteThreadComment = useCallback(
    async (commentId: string) => {
      const base = commentsApiBase();
      if (!base || !commentId.trim()) return;
      setConceptError(null);

      let removedComment: EmailThreadComment | null = null;
      setThreadComments((current) => {
        removedComment = current.find((comment) => comment.id === commentId) ?? null;
        return current.filter((comment) => comment.id !== commentId);
      });
      setSelectedCommentId((current) =>
        current === commentId ? null : current,
      );

      void client
        .requestJson(`${base}/${encodeURIComponent(commentId)}`, {
          method: "DELETE",
        })
        .catch((caught) => {
          if (removedComment) {
            setThreadComments((current) => {
              if (current.some((comment) => comment.id === removedComment!.id)) {
                return current;
              }
              return [...current, removedComment!].sort(
                (a, b) =>
                  Date.parse(a.createdAt) - Date.parse(b.createdAt),
              );
            });
          }
          setConceptError(
            caught instanceof Error
              ? caught.message
              : "Could not delete comment.",
          );
        });
    },
    [client, commentsApiBase],
  );

  const updateThreadComment = useCallback(
    async (commentId: string, body: string) => {
      const base = commentsApiBase();
      if (!base || !commentId.trim()) return;
      setSavingCommentId(commentId);
      setConceptError(null);
      try {
        const updated = await client.requestJson<EmailThreadComment>(
          `${base}/${encodeURIComponent(commentId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
          },
        );
        setThreadComments((current) =>
          current.map((comment) =>
            comment.id === commentId ? updated : comment,
          ),
        );
        setSelectedCommentId(null);
      } catch (caught) {
        setConceptError(
          caught instanceof Error
            ? caught.message
            : "Could not update comment.",
        );
      } finally {
        setSavingCommentId(null);
      }
    },
    [client, commentsApiBase],
  );

  useEffect(() => {
    if (!selectedCommentId) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-email-comment-bubble]")) return;
      setSelectedCommentId(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedCommentId(null);
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [selectedCommentId]);

  useEffect(() => {
    setSelectedCommentId(null);
  }, [messageId]);

  const handleCommentAgentResult = useCallback(
    async (result: {
      commentBody: string;
      replyDraftBody: string | null;
      createTasks: EmailAgentCreateTaskSpec[];
      intent: "comment" | "revise-draft";
    }) => {
      if (result.intent === "revise-draft") {
        const nextBody =
          result.replyDraftBody?.trim() ||
          extractAgentReplyBody(result.commentBody) ||
          result.commentBody.trim();
        if (!nextBody) {
          setConceptError("Agent did not return an updated draft.");
          return;
        }
        setConceptError(null);
        setConceptBodyDraft(nextBody);
        setReplyComposeOpen(true);
        const targetInboxId =
          message?.conceptDraft?.inboxId?.trim() ||
          inboxId?.trim() ||
          "";
        const targetDraftId =
          message?.conceptDraft?.draftId?.trim() ||
          message?.conceptDraftId?.trim() ||
          "";
        try {
          if (targetInboxId && targetDraftId) {
            await saveConceptDraftBody(targetInboxId, targetDraftId, nextBody);
          } else {
            await saveConceptReply(nextBody);
          }
          promoteEmailThreadStatus("in_review");
        } catch {
          // saveConceptDraftBody / saveConceptReply already surface errors.
        }
        return;
      }

      // Draft-only turns: show the reply email, never an acknowledgment comment.
      if (result.replyDraftBody?.trim()) {
        setConceptError(null);
        setReplyComposeOpen(true);
        // Preview/comment turns only animate once we know a draft update landed.
        setDraftStageWorking(true);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 280);
        });
        try {
          await saveConceptReply(result.replyDraftBody);
          promoteEmailThreadStatus("in_review");
        } finally {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 48);
          });
          setDraftStageWorking(false);
        }
        // Fall through — agent may also create tasks in the same turn.
      }

      if (result.createTasks.length > 0 && message && inboxId) {
        const meta = message.threadMetadata;
        const emailHref = getEmailItemHref(inboxId, message.messageId);
        const emailLink = {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `link_${Date.now()}`,
          url: emailHref,
          createdAt: new Date().toISOString(),
        };
        let noteUsed = false;
        let createdCount = 0;
        for (const spec of result.createTasks) {
          try {
            const project =
              (spec.projectKey
                ? projects.find(
                    (entry) =>
                      entry.key.toLowerCase() ===
                      spec.projectKey!.trim().toLowerCase(),
                  )
                : null) ??
              (meta?.projectId
                ? projects.find((entry) => entry.id === meta.projectId)
                : null) ??
              null;
            const body: Record<string, unknown> = {
              title: spec.title,
              description: spec.description ?? null,
              dueDate: spec.dueDate ?? null,
              priority: spec.priority ?? 0,
              status: spec.status ?? "triage",
              inbox: spec.inbox ?? true,
              projectId: project?.id ?? meta?.projectId ?? null,
              contactId: meta?.contactId ?? null,
              assigneeId: meta?.assigneeId ?? null,
              links: [emailLink],
              activityActor: "agent",
            };
            const created = await client.requestJson<ApiTask>("/api/v1/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const href = resolveDuplicatedTaskHref({
              id: created.id,
              number: created.number ?? null,
              projectKey: project?.key ?? null,
            });
            const displayId =
              project?.key && created.number != null
                ? formatTaskDisplayId(project.key, created.number)
                : created.number != null
                  ? formatTaskDisplayId(INBOX_TASK_KEY, created.number)
                  : created.title;
            const note =
              !noteUsed && result.commentBody.trim()
                ? result.commentBody.trim()
                : null;
            noteUsed = true;
            await postThreadComment(
              formatEmailAgentTaskCardComment(
                {
                  taskId: created.id,
                  number: created.number ?? null,
                  title: created.title,
                  displayId,
                  projectKey: project?.key ?? null,
                  projectName: project?.name ?? null,
                  projectIcon: project?.icon ?? null,
                  dueDate: created.dueDate ?? spec.dueDate ?? null,
                  status: created.status ?? spec.status ?? "triage",
                  priority: created.priority ?? spec.priority ?? 0,
                  href,
                },
                note,
              ),
              "agent",
            );
            createdCount += 1;
            promoteEmailThreadStatus("in_progress");
          } catch (caught) {
            setConceptError(
              caught instanceof Error
                ? caught.message
                : "Could not create task from email.",
            );
          }
        }
        if (createdCount > 0) return;
      }

      if (result.commentBody.trim() && !result.replyDraftBody?.trim()) {
        try {
          await postThreadComment(result.commentBody, "agent");
        } catch (caught) {
          setConceptError(
            caught instanceof Error
              ? caught.message
              : "Could not save agent comment.",
          );
        }
      }
    },
    [
      client,
      inboxId,
      message,
      postThreadComment,
      projects,
      promoteEmailThreadStatus,
      saveConceptDraftBody,
      saveConceptReply,
    ],
  );

  const {
    sendComment: sendCommentToAgent,
    working: commentAgentWorking,
    revisingDraft: draftAgentWorking,
    error: commentAgentError,
  } = useEmailThreadCommentAgent({
    taskId: isCompose ? null : taskId,
    message: isCompose ? null : messageWithComments,
    onResult: handleCommentAgentResult,
    enabled: !isCompose,
  });

  useEffect(() => {
    previousCommentIdsRef.current = null;
    didInitialThreadScrollRef.current = false;
    wasReplyChromeVisibleRef.current = false;
    previousDraftFingerprintRef.current = "";
    previousThreadMessageCountRef.current = 0;
    followEndCleanupRef.current?.();
    followEndCleanupRef.current = null;
    setFreshCommentIds(new Set());
    setWorkingEnter(false);
  }, [messageId]);

  useEffect(() => {
    const ids = threadComments.map((comment) => comment.id);
    const previous = previousCommentIdsRef.current;
    previousCommentIdsRef.current = ids;
    if (previous === null) return;
    const prevSet = new Set(previous);
    const fresh = ids.filter((id) => !prevSet.has(id));
    if (fresh.length === 0) return;
    setFreshCommentIds(new Set(fresh));
    const timer = window.setTimeout(() => setFreshCommentIds(new Set()), 380);
    return () => window.clearTimeout(timer);
  }, [threadComments]);

  useEffect(() => {
    if (!commentAgentWorking) {
      setWorkingEnter(false);
      return;
    }
    setWorkingEnter(true);
    const timer = window.setTimeout(() => setWorkingEnter(false), 380);
    return () => window.clearTimeout(timer);
  }, [commentAgentWorking]);

  const replyChromeVisible =
    replyComposeOpen || Boolean(message?.conceptDraft);
  const conceptDraftKey =
    message?.conceptDraft?.draftId?.trim() ||
    message?.conceptDraftId?.trim() ||
    "";
  const conceptDraftUpdatedAt = message?.conceptDraft?.updatedAt ?? "";
  const threadMessageCount =
    message?.threadMessages && message.threadMessages.length > 0
      ? message.threadMessages.length
      : message
        ? 1
        : 0;

  useEffect(() => {
    const el = threadScrollportRef.current;
    if (!el || loading) return;

    const replyChromeJustShown =
      replyChromeVisible && !wasReplyChromeVisibleRef.current;
    wasReplyChromeVisibleRef.current = replyChromeVisible;

    // Fingerprint server draft identity — not local body length (typing).
    const draftFingerprint = `${conceptDraftKey}|${conceptDraftUpdatedAt}`;
    const draftContentChanged =
      replyChromeVisible &&
      draftFingerprint !== previousDraftFingerprintRef.current;
    previousDraftFingerprintRef.current = draftFingerprint;

    const previousThreadCount = previousThreadMessageCountRef.current;
    const inboundMailArrived =
      didInitialThreadScrollRef.current &&
      threadMessageCount > previousThreadCount;
    previousThreadMessageCountRef.current = threadMessageCount;

    const followEnd =
      !didInitialThreadScrollRef.current ||
      commentAgentWorking ||
      freshCommentIds.size > 0 ||
      replyChromeJustShown ||
      draftStageWorking ||
      draftAgentWorking ||
      draftContentChanged ||
      inboundMailArrived;

    if (!followEnd) return;

    const scrollToEnd = (behavior: ScrollBehavior) => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    };

    const behavior: ScrollBehavior = didInitialThreadScrollRef.current
      ? "smooth"
      : "auto";
    didInitialThreadScrollRef.current = true;

    followEndCleanupRef.current?.();
    scrollToEnd(behavior);

    // Draft cards grow after mount (body stage / enter). Re-stick to the end
    // while height settles so the composer doesn't cover the Send row.
    const timers: number[] = [];
    const chaseDelaysMs = [48, 140, 280, 420, 640, 900];
    for (const delay of chaseDelaysMs) {
      timers.push(
        window.setTimeout(() => {
          scrollToEnd("auto");
        }, delay),
      );
    }
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scrollToEnd("auto");
          })
        : null;
    const threadRoot = el.querySelector(".email-thread");
    if (observer && threadRoot) {
      observer.observe(threadRoot);
    }
    const stopTimer = window.setTimeout(() => {
      observer?.disconnect();
    }, 1000);
    followEndCleanupRef.current = () => {
      for (const timer of timers) window.clearTimeout(timer);
      window.clearTimeout(stopTimer);
      observer?.disconnect();
    };
    return () => {
      followEndCleanupRef.current?.();
      followEndCleanupRef.current = null;
    };
  }, [
    commentAgentWorking,
    conceptDraftKey,
    conceptDraftUpdatedAt,
    draftAgentWorking,
    draftStageWorking,
    freshCommentIds,
    loading,
    messageId,
    replyChromeVisible,
    threadComments.length,
    threadMessageCount,
  ]);

  const emailMinimapItems = useMemo(() => {
    if (!message) return [] as EmailThreadMinimapItem[];
    const threadMessages =
      message.threadMessages && message.threadMessages.length > 0
        ? message.threadMessages
        : [
            {
              messageId: message.messageId,
              subject: message.subject,
              from: message.from,
              to: message.to ?? (message.inboxEmail ? [message.inboxEmail] : []),
            },
          ];
    const ourMailboxEmails = new Set(
      [
        message.inboxEmail,
        ...agentMail.mailboxes.map((mailbox) => mailbox.email),
      ]
        .map((email) => email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    );
    return deriveEmailThreadMinimapItems(
      threadMessages.map((entry) => {
        const fromEmail = parseReplyToAddress(entry.from).toLowerCase();
        const isSent = Boolean(fromEmail && ourMailboxEmails.has(fromEmail));
        return {
          messageId: entry.messageId,
          subject: entry.subject,
          from: entry.from,
          to: entry.to ?? [],
          direction: isSent ? ("sent" as const) : ("received" as const),
        };
      }),
    );
  }, [agentMail.mailboxes, message]);

  const updateEmailMinimapInView = useCallback(() => {
    const scroller = threadScrollportRef.current;
    if (!scroller || emailMinimapItems.length === 0) {
      setMinimapInViewIds(new Set());
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const next = new Set<string>();
    for (const item of emailMinimapItems) {
      const section = scroller.querySelector<HTMLElement>(
        `[data-email-message="${CSS.escape(item.id)}"]`,
      );
      if (!section) continue;
      const rect = section.getBoundingClientRect();
      if (rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom) {
        next.add(item.id);
      }
    }
    setMinimapInViewIds((current) => {
      if (current.size === next.size) {
        let same = true;
        for (const id of next) {
          if (!current.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return current;
      }
      return next;
    });
  }, [emailMinimapItems]);

  const minimapRafRef = useRef<number | null>(null);
  const scheduleEmailMinimapInView = useCallback(() => {
    if (minimapRafRef.current != null) return;
    minimapRafRef.current = window.requestAnimationFrame(() => {
      minimapRafRef.current = null;
      updateEmailMinimapInView();
    });
  }, [updateEmailMinimapInView]);

  useEffect(() => {
    const shell = threadScrollShellRef.current;
    if (!shell) return;
    const syncGutter = () => {
      const main =
        shell.querySelector<HTMLElement>(".email-detail-main") ?? shell;
      const width = main.getBoundingClientRect().width;
      setMinimapHasPersistentGutter(
        resolveEmailThreadMinimapHasPersistentGutter(width),
      );
      setMinimapHitStripWidth(resolveEmailThreadMinimapHitStripWidth(width));
    };
    syncGutter();
    const observer = new ResizeObserver(syncGutter);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [messageId, emailMinimapItems.length]);

  useEffect(() => {
    const scroller = threadScrollportRef.current;
    if (!scroller) return;
    updateEmailMinimapInView();
    const onScroll = () => scheduleEmailMinimapInView();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const frame = requestAnimationFrame(updateEmailMinimapInView);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      if (minimapRafRef.current != null) {
        cancelAnimationFrame(minimapRafRef.current);
        minimapRafRef.current = null;
      }
    };
  }, [
    scheduleEmailMinimapInView,
    updateEmailMinimapInView,
    messageId,
    emailMinimapItems.length,
    threadComments.length,
  ]);

  const jumpToEmailMinimapItem = useCallback((item: EmailThreadMinimapItem) => {
    const scroller = threadScrollportRef.current;
    if (!scroller) return;
    const section = scroller.querySelector<HTMLElement>(
      `[data-email-message="${CSS.escape(item.id)}"]`,
    );
    if (!section) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    scroller.scrollTop += sectionRect.top - scrollerRect.top - 16;
  }, []);

  const conceptDraftActionsDisabled =
    conceptSaving ||
    conceptBodySaving ||
    draftAgentWorking ||
    draftStageWorking;

  const showDraftWorking = draftAgentWorking || draftStageWorking;

  const emailDraftModeShortcutsEnabled =
    !showDraftWorking &&
    (isCompose ||
      Boolean(draft) ||
      Boolean(message && (replyComposeOpen || message.conceptDraft)));

  useEmailDraftBodyModeShortcuts({
    mode: conceptBodyMode,
    onModeChange: (mode) => {
      void handleConceptBodyModeChange(mode);
    },
    enabled: emailDraftModeShortcutsEnabled,
  });

  useEffect(() => {
    if (!commentAgentError) return;
    setDraftStageWorking(false);
    setConceptError(commentAgentError);
  }, [commentAgentError]);

  const handleSubmitThreadComment = useCallback(
    async (body: string) => {
      if (!message) return;
      setCommentSending(true);
      setConceptError(null);
      promoteEmailThreadStatus("in_progress");

      const assignee = assigneeId
        ? contacts.find((entry) => entry.id === assigneeId) ?? null
        : null;
      const organization = organizationId
        ? organizations.find((entry) => entry.id === organizationId) ?? null
        : null;
      const contact = contactId
        ? contacts.find((entry) => entry.id === contactId) ?? null
        : null;
      const project = projectKey
        ? projects.find((entry) => entry.key === projectKey) ?? null
        : null;
      const existingDraft = message.conceptDraft;
      const agentMessage: AgentMailMessageDetail = {
        ...message,
        threadComments: threadComments,
        threadMetadata: message.threadMetadata
          ? {
              ...message.threadMetadata,
              contactId,
              contactName:
                contact?.name ?? message.threadMetadata.contactName ?? null,
              organizationId,
              organizationName:
                organization?.name ??
                message.threadMetadata.organizationName ??
                null,
              assigneeId,
              assigneeName:
                assignee?.name ?? message.threadMetadata.assigneeName ?? null,
              projectId: project?.id ?? message.threadMetadata.projectId,
              projectName:
                project?.name ?? message.threadMetadata.projectName ?? null,
              projectKey:
                project?.key ?? message.threadMetadata.projectKey ?? null,
            }
          : message.threadMetadata,
        conceptDraft: existingDraft
          ? {
              ...existingDraft,
              body: conceptBodyDraft.trim() || existingDraft.body,
            }
          : existingDraft,
      };

      const reviseDraft =
        conceptBodyMode === "edit" &&
        Boolean(
          existingDraft?.draftId?.trim() ||
            message.conceptDraftId?.trim() ||
            replyComposeOpen,
        );

      try {
        if (reviseDraft) {
          await sendCommentToAgent(body, {
            message: agentMessage,
            intent: "revise-draft",
            draftBody: conceptBodyDraft,
          });
          return;
        }

        const created = await postThreadComment(body, "user");
        const nextComments = created
          ? [...threadComments, created]
          : threadComments;
        await sendCommentToAgent(body, {
          message: {
            ...agentMessage,
            threadComments: nextComments,
          },
        });
      } catch (caught) {
        setConceptError(
          caught instanceof Error ? caught.message : "Could not post comment.",
        );
      } finally {
        setCommentSending(false);
      }
    },
    [
      assigneeId,
      conceptBodyDraft,
      conceptBodyMode,
      contactId,
      contacts,
      message,
      organizationId,
      organizations,
      postThreadComment,
      projectKey,
      projects,
      promoteEmailThreadStatus,
      replyComposeOpen,
      sendCommentToAgent,
      threadComments,
    ],
  );

  const title =
    isCompose
      ? composeSubject.trim() || composeDraft?.subject?.trim() || "New email"
      : draft?.subject?.trim() ||
        message?.subject?.trim() ||
        (draftId ? "Reply concept" : "Email");

  const handleThreadBodyViewModeChange = useCallback(
    (next: EmailThreadBodyViewMode) => {
      setThreadBodyViewMode(next);
      try {
        window.localStorage.setItem(EMAIL_THREAD_BODY_VIEW_MODE_KEY, next);
      } catch {
        // ignore storage failures
      }
    },
    [],
  );

  const breadcrumbItems = useMemo(() => {
    const listContext = getEmailListContext(location.search);
    const currentLabel = isCompose
      ? composeSubject.trim() || "Compose"
      : title;

    if (listContext === "inbox") {
      return [
        { label: "Inbox", href: "/inbox" },
        { label: currentLabel },
      ];
    }

    if (listContext === "project") {
      const project =
        (projectKey
          ? projects.find((entry) => entry.key === projectKey)
          : null) ??
        (message?.threadMetadata?.projectId
          ? projects.find(
              (entry) => entry.id === message.threadMetadata?.projectId,
            )
          : null) ??
        null;
      const projectLabel =
        project?.name ??
        message?.threadMetadata?.projectName ??
        projectKey ??
        "Project";
      const projectHref = project
        ? getScopedProjectSectionHref(project.key, "tasks", {
            kind: "standalone",
          })
        : "/projects";
      return [
        { label: "Projects", href: "/projects" },
        { label: projectLabel, href: projectHref },
        { label: currentLabel },
      ];
    }

    // Tasks list (explicit or default when opened outside Inbox).
    return [
      { label: "Tasks", href: "/tasks" },
      { label: currentLabel },
    ];
  }, [
    composeSubject,
    isCompose,
    location.search,
    message?.threadMetadata?.projectId,
    message?.threadMetadata?.projectName,
    projectKey,
    projects,
    title,
  ]);

  useDesktopSectionBreadcrumb(breadcrumbItems);

  const composeMailboxes = useMemo(
    () =>
      agentMail.mailboxes.map((mailbox) => ({
        ...mailbox,
        avatarSrc: mailbox.contactId
          ? contactAvatarSrc[mailbox.contactId] ?? null
          : null,
      })),
    [agentMail.mailboxes, contactAvatarSrc],
  );

  const mailboxSignOffAvatarSrc = (mailboxInboxId: string | null | undefined) => {
    const id = mailboxInboxId?.trim();
    if (!id) return null;
    return composeMailboxes.find((mailbox) => mailbox.inboxId === id)?.avatarSrc ?? null;
  };

  if (isCompose) {
    const selectedMailbox =
      agentMail.mailboxes.find((mailbox) => mailbox.inboxId === composeInboxId) ??
      null;
    const composeContext = {
      fromEmail: selectedMailbox?.email ?? "",
      to: composeTo,
      subject: composeSubject,
    };
    return (
      <>
        <RegisterPageTitle title={title} />
        <div className="inbox-detail-layout inbox-detail-layout--compose">
          <DesktopEmailComposeLayout
            taskId={emailComposeAgentTaskId()}
            composeContext={composeContext}
            promptDisabled={conceptSaving || conceptBodySaving}
            promptContextLabel={
              conceptBodyMode === "edit" && composeDraft ? "Concept draft" : null
            }
            promptPlaceholder={
              conceptBodyMode === "edit" && composeDraft
                ? "Ask AI to update this draft…"
                : undefined
            }
            onAssistantTurnComplete={(text) => saveComposeDraft(text)}
          >
            {(slot) => (
              <div className="inbox-detail-body inbox-detail-body--email">
                {conceptError ? (
                  <p className="email-concept-error" role="alert">
                    {conceptError}
                  </p>
                ) : null}
                {sendError ? (
                  <p className="email-send-error" role="alert">
                    {sendError}
                  </p>
                ) : null}
                {composeLoading ? (
                  <p className="email-concept-badge">Loading draft…</p>
                ) : null}
                <EmailComposeChrome
                  mailboxes={composeMailboxes}
                  inboxId={composeInboxId}
                  onInboxIdChange={(nextInboxId) => {
                    setComposeInboxId(nextInboxId);
                    writeEmailComposeSession({
                      sessionId: composeSession.sessionId,
                      draftId: composeDraft?.draftId ?? null,
                      inboxId: nextInboxId,
                    });
                  }}
                  to={composeTo}
                  onToChange={setComposeTo}
                  subject={composeSubject}
                  onSubjectChange={setComposeSubject}
                  body={conceptBodyDraft}
                  bodyMode={conceptBodyMode}
                  onBodyChange={composeDraft ? setConceptBodyDraft : undefined}
                  replyGreeting={composeDraft?.greeting}
                  replySignOff={composeDraft?.signOff}
                  replySignOffAvatarSrc={mailboxSignOffAvatarSrc(composeInboxId)}
                  fieldsDisabled={
                    conceptSaving || conceptBodySaving || slot.agentWorking
                  }
                  agentWorking={slot.agentWorking}
                  composer={slot.agentPrompt}
                  actions={
                    <EmailDraftActions
                      modeOnly={!composeDraft}
                      onSend={
                        composeDraft
                          ? () => {
                              void sendDraft(
                                composeDraft.inboxId,
                                composeDraft.draftId,
                              );
                            }
                          : undefined
                      }
                      onDelete={
                        composeDraft
                          ? () => {
                              void deleteDraft(
                                composeDraft.inboxId,
                                composeDraft.draftId,
                              );
                            }
                          : undefined
                      }
                      sending={sending}
                      deleting={deleting}
                      disabled={
                        conceptDraftActionsDisabled || slot.agentWorking
                      }
                      bodyMode={conceptBodyMode}
                      onBodyModeChange={(mode) => {
                        void handleConceptBodyModeChange(mode);
                      }}
                      savingBody={conceptBodySaving}
                    />
                  }
                />
              </div>
            )}
          </DesktopEmailComposeLayout>
        </div>
      </>
    );
  }

  let content;
  if (!inboxId || (!messageId && !draftId)) {
    content = (
      <div className="inbox-detail-empty">
        <div>
          <p>Select a message</p>
          <p className="inbox-detail-empty-hint">
            Incoming mail from the inboxes in{" "}
            <Link className="inbox-moved-banner__link" to="/settings/email">
              Settings → E-mail
            </Link>{" "}
            appears in the left panel.
          </p>
        </div>
      </div>
    );
  } else if (loading) {
    content = (
      <div className="inbox-detail-empty">
        <p>Loading…</p>
      </div>
    );
  } else if (error) {
    content = (
      <div className="inbox-detail-empty">
        <p>{error}</p>
      </div>
    );
  } else if (draft) {
    content = (
      <div className="inbox-detail-body inbox-detail-body--email">
        {sendError ? (
          <p className="email-send-error" role="alert">
            {sendError}
          </p>
        ) : null}
        <EmailThreadMessageCard
          isConcept
          subject={draft.subject?.trim() || "Reply concept"}
          from={draft.from}
          to={draft.to ?? []}
          timestamp={draft.updatedAt}
          body={conceptBodyDraft}
          bodyMode={conceptBodyMode}
          onBodyChange={setConceptBodyDraft}
          replyGreeting={draft.greeting}
          replySignOff={draft.signOff}
          replySignOffAvatarSrc={mailboxSignOffAvatarSrc(draft.inboxId)}
          emptyBodyLabel="This draft has no text body."
          agentWorking={showDraftWorking}
          fieldsDisabled={conceptDraftActionsDisabled}
          actions={
            <EmailDraftActions
              onSend={() => {
                void sendDraft(draft.inboxId, draft.draftId, draft.inReplyTo);
              }}
              onDelete={() => {
                void deleteDraft(draft.inboxId, draft.draftId, draft.inReplyTo);
              }}
              sending={sending}
              deleting={deleting}
              disabled={conceptDraftActionsDisabled}
              bodyMode={conceptBodyMode}
              onBodyModeChange={(mode) => {
                void handleConceptBodyModeChange(mode);
              }}
              savingBody={conceptBodySaving}
            />
          }
        />
      </div>
    );
  } else if (message) {
    const threadMessages =
      message.threadMessages && message.threadMessages.length > 0
        ? message.threadMessages
        : [
            {
              messageId: message.messageId,
              threadId: message.threadId,
              subject: message.subject,
              from: message.from,
              to: message.to ?? (message.inboxEmail ? [message.inboxEmail] : []),
              timestamp: message.timestamp,
              text: message.text,
              html: message.html,
              extractedText: message.extractedText,
              extractedHtml: message.extractedHtml,
              labels: message.labels,
              inReplyTo: message.inReplyToMessageId ?? null,
            },
          ];
    const ourMailboxEmails = new Set(
      [
        message.inboxEmail,
        ...agentMail.mailboxes.map((mailbox) => mailbox.email),
      ]
        .map((email) => email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    );
    const status = (
      <>
        {conceptError ? (
          <p className="email-concept-error" role="alert">
            {conceptError}
          </p>
        ) : null}
        {sendError ? (
          <p className="email-send-error" role="alert">
            {sendError}
          </p>
        ) : null}
      </>
    );
    const conceptDraftId =
      message.conceptDraft?.draftId?.trim() || message.conceptDraftId?.trim();
    const draftInboxId = message.conceptDraft?.inboxId?.trim() || inboxId || "";
    const replyActive =
      replyComposeOpen || Boolean(message.conceptDraft);
    const resolvedReplyInboxId =
      replyInboxId || draftInboxId || inboxId || composeMailboxes[0]?.inboxId || "";
    const resolvedReplyTo =
      replyTo || parseReplyToAddress(message.from);
    const resolvedReplySubject =
      replySubjectText || formatReplySubject(message.subject);
    const linkedContactForFrom = contactId
      ? contacts.find((entry) => entry.id === contactId) ?? null
      : null;
    const linkedAssigneeForComments = assigneeId
      ? contacts.find((entry) => entry.id === assigneeId) ?? null
      : null;
    const assigneeCommentName =
      linkedAssigneeForComments?.name?.trim() ||
      message.threadMetadata?.assigneeName?.trim() ||
      null;
    const assigneeCommentAvatarSrc = assigneeId
      ? contactAvatarSrc[assigneeId] ?? null
      : null;
    const threadContactPicker = {
      contactId,
      contactName:
        linkedContactForFrom?.name?.trim() ||
        message.threadMetadata?.contactName?.trim() ||
        null,
      contactEmail: linkedContactForFrom?.email?.trim() || null,
      contactAvatarSrc: contactId
        ? contactAvatarSrc[contactId] ?? null
        : null,
      options: contactOptions,
      onContactChange: handleContactChange,
      onCreateContactFromQuery: (query: string) => {
        void workspace
          .createContact({
            name: query,
            organizationId: organizationId ?? undefined,
          })
          .then((created) => {
            handleContactChange(created.id);
          });
      },
    };
    const mailboxChipForEmail = (email: string | null | undefined) => {
      const normalized = email?.trim().toLowerCase() || null;
      if (!normalized) return null;
      const mailbox =
        composeMailboxes.find(
          (entry) => entry.email.trim().toLowerCase() === normalized,
        ) ?? null;
      if (!mailbox) return null;
      return {
        name: emailMailboxFromDisplay(mailbox),
        avatarSrc: mailbox.avatarSrc ?? null,
      };
    };
    const mailboxChipForInbox = (mailboxInboxId: string | null | undefined) => {
      const mailbox =
        composeMailboxes.find((entry) => entry.inboxId === mailboxInboxId) ??
        null;
      if (!mailbox) return null;
      return {
        name: emailMailboxFromDisplay(mailbox),
        avatarSrc: mailbox.avatarSrc ?? null,
      };
    };
    const replyDraftActions = (
      <EmailDraftActions
        modeOnly={!conceptDraftId}
        onSend={
          conceptDraftId
            ? () => {
                void sendDraft(draftInboxId, conceptDraftId, messageId);
              }
            : undefined
        }
        onDelete={
          conceptDraftId
            ? () => {
                void deleteDraft(draftInboxId, conceptDraftId, messageId);
              }
            : undefined
        }
        sending={sending}
        deleting={deleting}
        disabled={conceptDraftActionsDisabled}
        bodyMode={conceptBodyMode}
        onBodyModeChange={(mode) => {
          void handleConceptBodyModeChange(mode);
        }}
        savingBody={conceptBodySaving}
      />
    );
    const replyChrome = replyActive ? (
      <EmailComposeChrome
        variant="reply"
        mailboxes={composeMailboxes}
        inboxId={resolvedReplyInboxId}
        onInboxIdChange={setReplyInboxId}
        to={resolvedReplyTo}
        onToChange={setReplyTo}
        subject={resolvedReplySubject}
        onSubjectChange={setReplySubjectText}
        body={conceptBodyDraft}
        bodyMode={conceptBodyMode}
        onBodyChange={setConceptBodyDraft}
        replyGreeting={message.conceptDraft?.greeting}
        replySignOff={message.conceptDraft?.signOff}
        replySignOffAvatarSrc={mailboxSignOffAvatarSrc(resolvedReplyInboxId)}
        toContact={{
          ...threadContactPicker,
          onContactChange: (next) => {
            handleContactChange(next);
            if (!next) return;
            const selected =
              contacts.find((entry) => entry.id === next) ?? null;
            const email = selected?.email?.trim();
            if (email) setReplyTo(email);
          },
        }}
        fieldsDisabled={
          conceptSaving ||
          conceptBodySaving ||
          draftAgentWorking ||
          draftStageWorking
        }
        agentWorking={showDraftWorking}
        actions={replyDraftActions}
      />
    ) : null;
    const replyTimestampMs = (() => {
      // Pin the open reply draft to the end of a chronological timeline so it
      // sits just above the composer (chat-style latest-at-bottom).
      if (replyActive) return Number.MAX_SAFE_INTEGER;
      const raw = message.conceptDraft?.updatedAt;
      if (raw) {
        const parsed = Date.parse(raw);
        if (Number.isFinite(parsed)) return parsed;
      }
      return 0;
    })();
    const timelineItems = [
      ...threadMessages.map((entry) => {
        const parsed = Date.parse(entry.timestamp);
        const fromEmail = parseReplyToAddress(entry.from).toLowerCase();
        const linkedContactEmail =
          linkedContactForFrom?.email?.trim().toLowerCase() || null;
        const isFromOurMailbox = Boolean(
          fromEmail && ourMailboxEmails.has(fromEmail),
        );
        const rawToList = entry.to.map((address) => address.trim()).filter(Boolean);
        // Prefer real To recipients; if AgentMail omits them on outbound, use the
        // linked contact email — never fall back to our own inbox on outbound To.
        const toList =
          rawToList.length > 0
            ? rawToList
            : isFromOurMailbox && linkedContactEmail
              ? [linkedContactEmail]
              : !isFromOurMailbox && message.inboxEmail
                ? [message.inboxEmail]
                : [];
        const toEmails = toList.map((address) =>
          parseReplyToAddress(address).toLowerCase(),
        );
        // Always put the thread-contact picker on the other-party side:
        // From for inbound, To for our outbound (and when the contact email is there).
        const contactField: "from" | "to" = (() => {
          if (linkedContactEmail && fromEmail === linkedContactEmail) {
            return "from";
          }
          if (linkedContactEmail && toEmails.includes(linkedContactEmail)) {
            return "to";
          }
          if (isFromOurMailbox) {
            return "to";
          }
          return "from";
        })();
        const ourToEmail =
          toEmails.find((email) => ourMailboxEmails.has(email)) ?? null;
        const fromMailboxChip =
          contactField === "to"
            ? mailboxChipForEmail(fromEmail) ??
              mailboxChipForInbox(inboxId || message.inboxId)
            : null;
        const toMailboxChip =
          contactField === "from"
            ? mailboxChipForEmail(ourToEmail) ??
              mailboxChipForInbox(inboxId || message.inboxId)
            : null;
        const sentMailbox =
          fromMailboxChip ??
          (isFromOurMailbox
            ? mailboxChipForInbox(inboxId || message.inboxId)
            : null);
        const partyAvatar = isFromOurMailbox
          ? {
              direction: "sent" as const,
              src: sentMailbox?.avatarSrc ?? null,
              label: sentMailbox?.name?.trim() || fromEmail || "Sent",
            }
          : {
              direction: "received" as const,
              src: threadContactPicker.contactAvatarSrc,
              label:
                threadContactPicker.contactName?.trim() ||
                entry.from.trim() ||
                "Received",
            };
        return {
          key: `email:${entry.messageId}`,
          at: Number.isFinite(parsed) ? parsed : 0,
          node: (
            <EmailThreadMessageCard
              messageId={entry.messageId}
              subject={entry.subject.trim() || "(no subject)"}
              from={entry.from}
              to={toList}
              timestamp={entry.timestamp}
              body={emailMessageBody(entry)}
              bodyHtml={emailMessageHtmlBody(entry)}
              inlineAttachments={(entry.attachments ?? []).map((attachment) => ({
                attachmentId: attachment.attachmentId,
                contentId: attachment.contentId ?? null,
              }))}
              attachments={(entry.attachments ?? []).map((attachment) => ({
                attachmentId: attachment.attachmentId,
                filename: attachment.filename ?? null,
                size: attachment.size ?? null,
                contentType: attachment.contentType ?? null,
                contentDisposition: attachment.contentDisposition ?? null,
                contentId: attachment.contentId ?? null,
              }))}
              fetchInlineAttachment={fetchInlineAttachment}
              peekInlineAttachment={peekInlineAttachment}
              inlineAttachmentInboxId={inboxId || message.inboxId}
              inlineAttachmentMessageId={entry.messageId}
              bodyViewMode={threadBodyViewMode}
              loadSource={() =>
                loadMessageSource(inboxId || message.inboxId, entry.messageId)
              }
              isSent={isFromOurMailbox}
              partyAvatar={partyAvatar}
              fromContact={
                contactField === "from" ? threadContactPicker : null
              }
              toContact={contactField === "to" ? threadContactPicker : null}
              fromMailbox={fromMailboxChip}
              toMailbox={toMailboxChip}
              onReply={() => setReplyComposeOpen(true)}
              onReplyAll={() => setReplyComposeOpen(true)}
              onForward={() =>
                startForward({
                  subject: entry.subject,
                  from: entry.from,
                  to: toList,
                  timestamp: entry.timestamp,
                  body: emailMessageBody(entry),
                })
              }
              onMarkUnreadFromHere={() => {
                const entryAt = Date.parse(entry.timestamp);
                const ids = threadMessages
                  .filter((row) => {
                    if (row.messageId === entry.messageId) return true;
                    const rowAt = Date.parse(row.timestamp);
                    return (
                      Number.isFinite(entryAt) &&
                      Number.isFinite(rowAt) &&
                      rowAt >= entryAt
                    );
                  })
                  .map((row) => row.messageId);
                markMessagesUnread(ids);
              }}
              onReportSpam={() => handleReportSpamMessage(entry.messageId)}
              deleteEntityLabel={`email from ${parseReplyToAddress(entry.from) || "sender"}`}
              onDelete={() => handleDeleteThreadMessage(entry.messageId)}
            />
          ),
        };
      }),
      ...threadComments.flatMap((comment) => {
        const parsed = Date.parse(comment.createdAt);
        const at = Number.isFinite(parsed) ? parsed : 0;
        const taskCard = parseEmailAgentTaskCard(comment.body);
        const bubbleProps = {
          author: comment.author,
          timestamp: comment.createdAt,
          authorName:
            comment.author === "agent" ? assigneeCommentName : null,
          authorAvatarSrc:
            comment.author === "agent" ? assigneeCommentAvatarSrc : null,
          entering: freshCommentIds.has(comment.id),
          selected: selectedCommentId === comment.id,
          onSelect: () => {
            setSelectedCommentId((current) =>
              current === comment.id ? null : comment.id,
            );
          },
          onDelete: () => {
            void deleteThreadComment(comment.id);
          },
          saving: savingCommentId === comment.id,
        } as const;

        if (taskCard) {
          const chip = resolveAgentTaskMentionChip(
            taskCard.card,
            mentionCatalog?.tasks ?? [],
          );
          const note = taskCard.note.trim();
          return [
            {
              key: `comment-task:${comment.id}`,
              at,
              node: (
                <div className="email-thread-agent-task">
                  {note ? (
                    <EmailThreadCommentBubble
                      {...bubbleProps}
                      body={note}
                      onSaveEdit={(nextBody) =>
                        updateThreadComment(
                          comment.id,
                          formatEmailAgentTaskCardComment(
                            taskCard.card,
                            nextBody,
                          ),
                        )
                      }
                    />
                  ) : null}
                  <div className="mention-task-block">
                    <TaskMentionBlockChip
                      task={chip.task}
                      href={chip.href}
                    />
                  </div>
                </div>
              ),
            },
          ];
        }

        return [
          {
            key: `comment:${comment.id}`,
            at,
            node: (
              <EmailThreadCommentBubble
                {...bubbleProps}
                body={comment.body}
                onSaveEdit={(nextBody) =>
                  updateThreadComment(comment.id, nextBody)
                }
              />
            ),
          },
        ];
      }),
      ...(replyChrome
        ? [
            {
              key: `reply:${conceptDraftId ?? "draft"}`,
              at: replyTimestampMs,
              node: replyChrome,
            },
          ]
        : []),
    ].sort((a, b) => a.at - b.at);
    const threadTimeline = (
      <div className="email-thread">
        {status}
        {timelineItems.map((item) => (
          <Fragment key={item.key}>{item.node}</Fragment>
        ))}
        {commentAgentWorking ? (
          <div
            className={`email-thread-working-row${
              workingEnter ? " email-thread-working-row--enter" : ""
            }`}
            role="status"
          >
            <span className="email-thread-working-dots" aria-hidden>
              <span className="email-thread-working-dot" />
              <span className="email-thread-working-dot" />
              <span className="email-thread-working-dot" />
            </span>
            <span className="email-thread-working-copy">Working…</span>
          </div>
        ) : null}
      </div>
    );
    const metadata = message.threadMetadata;
    const linkedOrganization = organizationId
      ? organizations.find((entry) => entry.id === organizationId) ?? null
      : null;
    const linkedContact = contactId
      ? contacts.find((entry) => entry.id === contactId) ?? null
      : null;
    const linkedAssignee = assigneeId
      ? contacts.find((entry) => entry.id === assigneeId) ?? null
      : null;
    const linkedProject = projectKey
      ? projects.find((entry) => entry.key === projectKey) ?? null
      : null;
    content = (
      <div
        className="email-detail-split"
        data-content-detail
        data-detail-split=""
      >
        <div className="email-detail-scroll-shell" ref={threadScrollShellRef}>
          <EmailThreadMinimap
            items={emailMinimapItems}
            hasPersistentGutter={minimapHasPersistentGutter}
            hitStripWidth={minimapHitStripWidth}
            inViewIds={minimapInViewIds}
            onSelect={jumpToEmailMinimapItem}
          />
          <div
            ref={threadScrollportRef}
            className="email-detail-scrollport email-detail-scrollport--fade"
          >
            <div className="email-detail-scroll-row">
              <div className="email-detail-main">{threadTimeline}</div>
              <ResizableSidePanel
                storageKey={EMAIL_PROPERTIES_PANEL_WIDTH_KEY}
                className="detail-properties-panel email-detail-properties-rail"
                edge="start"
                panelRef={propertiesRailRef}
              >
                <div className="detail-properties-panel__inner">
                  <div className="email-detail-view-toggle">
                    <SegmentedPillToggle
                      value={threadBodyViewMode}
                      options={[
                        { value: "plain", label: "Plain text" },
                        { value: "rendered", label: "Rendered" },
                        { value: "source", label: "Source" },
                      ]}
                      onChange={handleThreadBodyViewModeChange}
                      ariaLabel="Email body view mode"
                    />
                  </div>
                  <EmailPropertiesDisplay
                    thread={{
                      organizationId,
                      organizationName:
                        linkedOrganization?.name ??
                        metadata?.organizationName ??
                        null,
                      contactId,
                      contactName:
                        linkedContact?.name ?? metadata?.contactName ?? null,
                      contactAvatarSrc: contactId
                        ? contactAvatarSrc[contactId] ?? null
                        : null,
                      assigneeId,
                      assigneeName:
                        linkedAssignee?.name ?? metadata?.assigneeName ?? null,
                      projectKey: linkedProject?.key ?? projectKey,
                      projectName:
                        linkedProject?.name ?? metadata?.projectName ?? null,
                      status:
                        statusOverride ??
                        migrateLegacyTaskStatus(metadata?.status ?? "triage"),
                      priority: priorityOverride ?? metadata?.priority ?? 0,
                      dueDate:
                        dueDateOverride !== undefined
                          ? dueDateOverride
                          : metadata?.dueDate
                            ? new Date(metadata.dueDate)
                            : null,
                    }}
                    organizationOptions={organizationOptions}
                    contactOptions={contactOptions}
                    assigneeOptions={assigneeOptions}
                    projectOptions={projectOptions}
                    organizationNavigateHref={
                      organizationId ? `/organizations/${organizationId}` : null
                    }
                    contactNavigateHref={
                      contactId ? `/contacts/${contactId}` : null
                    }
                    assigneeNavigateHref={
                      assigneeId ? `/contacts/${assigneeId}` : null
                    }
                    projectNavigateHref={
                      projectKey ? `/projects/${projectKey}` : null
                    }
                    onStatusChange={(next) => {
                      setStatusOverride(next);
                      if (inboxId && message) {
                        dispatchEmailListPatch({
                          inboxId,
                          messageId: message.messageId,
                          threadId: message.threadId ?? null,
                          status: next,
                        });
                      }
                      void patchThreadMetadata({ status: next });
                    }}
                    onPriorityChange={(next) => {
                      setPriorityOverride(next);
                      if (inboxId && message) {
                        dispatchEmailListPatch({
                          inboxId,
                          messageId: message.messageId,
                          threadId: message.threadId ?? null,
                          priority: next,
                        });
                      }
                      void patchThreadMetadata({ priority: next });
                    }}
                    onDueDateChange={(next) => {
                      setDueDateOverride(next);
                      if (inboxId && message) {
                        dispatchEmailListPatch({
                          inboxId,
                          messageId: message.messageId,
                          threadId: message.threadId ?? null,
                          dueDate: next ? next.toISOString() : null,
                        });
                      }
                      void patchThreadMetadata({
                        dueDate: next ? next.toISOString() : null,
                      });
                    }}
                    onOrganizationChange={(next) => {
                      setOrganizationId(next);
                      const organization = next
                        ? organizations.find((entry) => entry.id === next) ??
                          null
                        : null;
                      if (inboxId && message) {
                        dispatchEmailListPatch({
                          inboxId,
                          messageId: message.messageId,
                          threadId: message.threadId ?? null,
                          organizationId: next,
                          organizationName: organization?.name ?? null,
                        });
                      }
                      void patchThreadMetadata({ organizationId: next });
                    }}
                    onContactChange={handleContactChange}
                    onAssigneeChange={(next) => {
                      setAssigneeId(next);
                      const assignee = next
                        ? contacts.find((entry) => entry.id === next) ?? null
                        : null;
                      if (inboxId && message) {
                        dispatchEmailListPatch({
                          inboxId,
                          messageId: message.messageId,
                          threadId: message.threadId ?? null,
                          assigneeId: next,
                          assigneeName: assignee?.name ?? null,
                        });
                      }
                      void patchThreadMetadata({ assigneeId: next });
                    }}
                    onProjectChange={(nextKey) => {
                      setProjectKey(nextKey);
                      const project = nextKey
                        ? projects.find((entry) => entry.key === nextKey) ??
                          null
                        : null;
                      if (inboxId && message) {
                        dispatchEmailListPatch({
                          inboxId,
                          messageId: message.messageId,
                          threadId: message.threadId ?? null,
                          projectId: project?.id ?? null,
                          projectName: project?.name ?? null,
                          projectKey: project?.key ?? null,
                        });
                      }
                      void patchThreadMetadata({
                        projectId: project?.id ?? null,
                      });
                    }}
                    onCreateOrganizationFromQuery={(query) => {
                      void workspace
                        .createOrganization({ name: query })
                        .then((created) => {
                          setOrganizationId(created.id);
                          if (inboxId && message) {
                            dispatchEmailListPatch({
                              inboxId,
                              messageId: message.messageId,
                              threadId: message.threadId ?? null,
                              organizationId: created.id,
                              organizationName: query.trim() || null,
                            });
                          }
                          void patchThreadMetadata({
                            organizationId: created.id,
                          });
                        });
                    }}
                    onCreateContactFromQuery={(query) => {
                      void workspace
                        .createContact({
                          name: query,
                          organizationId: organizationId ?? undefined,
                        })
                        .then((created) => {
                          handleContactChange(created.id);
                        });
                    }}
                    onCreateAssigneeFromQuery={(query) => {
                      void workspace
                        .createContact({
                          name: query,
                          organizationId: organizationId ?? undefined,
                        })
                        .then((created) => {
                          setAssigneeId(created.id);
                          void patchThreadMetadata({ assigneeId: created.id });
                        });
                    }}
                  />
                </div>
              </ResizableSidePanel>
            </div>
          </div>
          <div className="email-thread-composer-dock">
            <div className="email-thread-composer-dock__main">
              <div className="email-thread-composer-dock__inner">
                <EmailThreadCommentComposer
                  onSubmit={handleSubmitThreadComment}
                  disabled={conceptSaving || conceptBodySaving}
                  sending={commentSending || commentAgentWorking}
                  contextLabel={
                    conceptBodyMode === "edit" &&
                    Boolean(
                      message.conceptDraft ||
                        message.conceptDraftId ||
                        replyComposeOpen,
                    )
                      ? "Concept draft"
                      : null
                  }
                  placeholder={
                    conceptBodyMode === "edit" &&
                    Boolean(
                      message.conceptDraft ||
                        message.conceptDraftId ||
                        replyComposeOpen,
                    )
                      ? "Ask AI to update this draft…"
                      : "Message the agent about this email…"
                  }
                />
              </div>
            </div>
            <div
              className="email-thread-composer-dock__rail-spacer"
              style={{ width: propertiesRailWidth, flex: `0 0 ${propertiesRailWidth}px` }}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="inbox-detail-empty">
        <p>Not found.</p>
      </div>
    );
  }

  const detail = (
    <>
      <RegisterPageTitle title={title} />
      {message && inboxId && messageId ? (
        <>
          <RegisterEntityDeleteAction
            entityLabel={
              message.subject.trim()
                ? `${message.subject.trim()} (entire thread)`
                : "this conversation"
            }
            confirmLabel="Delete thread"
            actionVerb="Delete"
            onDelete={handleDeleteMessage}
          />
          <RegisterEntityMenuItems items={emailExtraMenuItems} />
        </>
      ) : null}
      <div className="inbox-detail-layout">{content}</div>
    </>
  );

  return detail;
}
