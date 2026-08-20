import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  AgentMailDraftDetail,
  AgentMailMessageDetail,
  EmailSendDraftResponse,
  EmailThreadComment,
  EmailThreadMetadata,
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
  getEmailItemHref,
  EmailPropertiesDisplay,
  EMAIL_PROPERTIES_PANEL_WIDTH_KEY,
  ResizableSidePanel,
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  migrateLegacyTaskStatus,
  isEmailComposePath,
  parseReplyToAddress,
  replySubject as formatReplySubject,
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
  emailMessageBody,
  extractAgentReplyBody,
  resolveEditableEmailDraftBody,
} from "../lib/agent/email-agent-prompt";
import { useEmailThreadCommentAgent } from "../lib/agent/use-email-thread-comment-agent";
import { useDesktopApi } from "../lib/api-context";
import { createRequestAbortSignal } from "../lib/request-timeout";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import {
  dispatchEmailListPatch,
  useAgentMailMailboxes,
} from "../lib/use-agentmail-mailboxes";
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

export function EmailPage() {
  const params = useParams<{
    inboxId?: string;
    messageId?: string;
    draftId?: string;
  }>();
  const locationPath =
    typeof window !== "undefined" ? window.location.pathname : "";
  const isCompose = isEmailComposePath(locationPath);
  const draftPath = parseEmailDraftPath(locationPath);
  const inboxId = draftPath?.inboxId ?? params.inboxId;
  const messageId = draftPath ? undefined : params.messageId;
  const draftId = draftPath?.draftId ?? params.draftId;

  const { client } = useDesktopApi();
  const navigate = useNavigate();
  const agentMail = useAgentMailMailboxes(isCompose || Boolean(messageId));
  const workspace = useDesktopWorkspaceData();
  const { organizations, contacts, projects } = workspace;
  const [message, setMessage] = useState<AgentMailMessageDetail | null>(null);
  const [draft, setDraft] = useState<AgentMailDraftDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(inboxId && (messageId || draftId)));
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
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null,
  );
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(
    null,
  );
  const [propertiesRailWidth, setPropertiesRailWidth] = useState(300);
  const propertiesRailRef = useRef<HTMLElement | null>(null);

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
  }, [message?.messageId, message?.threadMetadata, projects]);

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

  useDesktopSectionBreadcrumb([{ label: isCompose ? "Compose" : "Email" }]);

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

  const reloadMessageDetail = useCallback(
    async (messageInboxId: string, reloadMessageId: string) => {
      return client.requestJson<AgentMailMessageDetail>(
        `/api/v1/email/inboxes/${encodeURIComponent(messageInboxId)}/messages/${encodeURIComponent(reloadMessageId)}`,
      );
    },
    [client],
  );

  useEffect(() => {
    if (isCompose) return;
    if (!inboxId || (!messageId && !draftId)) {
      setMessage(null);
      setDraft(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const signal = createRequestAbortSignal(undefined, controller.signal);
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = draftId
      ? client.requestJson<AgentMailDraftDetail>(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}`,
          { signal },
        )
      : client.requestJson<AgentMailMessageDetail>(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId!)}`,
          { signal },
        );
    void load
      .then((body) => {
        if (cancelled) return;
        if (draftId) {
          setDraft(body as AgentMailDraftDetail);
          setMessage(null);
        } else {
          setMessage(body as AgentMailMessageDetail);
          setDraft(null);
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setMessage(null);
        setDraft(null);
        setError(
          caught instanceof Error && caught.name === "AbortError"
            ? "Request timed out or was cancelled. Is the core API running?"
            : caught instanceof Error
              ? caught.message
              : "Could not load email.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, draftId, inboxId, isCompose, messageId]);

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

  const conceptDraftActionsDisabled =
    conceptSaving || conceptBodySaving;

  const emailDraftModeShortcutsEnabled =
    isCompose ||
    Boolean(draft) ||
    Boolean(message && (replyComposeOpen || message.conceptDraft));

  useEmailDraftBodyModeShortcuts({
    mode: conceptBodyMode,
    onModeChange: (mode) => {
      void handleConceptBodyModeChange(mode);
    },
    enabled: emailDraftModeShortcutsEnabled,
  });

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
          null;
        if (returnToMessageId && inboxId) {
          const reloaded = await reloadMessageDetail(inboxId, returnToMessageId);
          setDraft(null);
          setMessage(reloaded);
          if (draftId) {
            navigate(getEmailItemHref(inboxId, returnToMessageId), {
              replace: true,
            });
          }
          return;
        }
        setDraft(null);
        setMessage(null);
        setComposeDraft(null);
        resetEmailComposeSession();
        navigate("/email", { replace: true });
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
    [client, draftId, inboxId, navigate, reloadMessageDetail],
  );

  const deleteDraft = useCallback(
    async (
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
      setDeleting(true);
      setSendError(null);
      try {
        await client.requestJson(
          `/api/v1/email/inboxes/${encodeURIComponent(resolvedInboxId)}/drafts/${encodeURIComponent(resolvedDraftId)}`,
          { method: "DELETE" },
        );
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
        requestMailboxReload();
        const returnToMessageId = reloadMessageId?.trim() || null;
        if (returnToMessageId && inboxId) {
          const reloaded = await reloadMessageDetail(inboxId, returnToMessageId);
          setDraft(null);
          setMessage(reloaded);
          if (draftId) {
            navigate(getEmailItemHref(inboxId, returnToMessageId), {
              replace: true,
            });
          }
          return;
        }
        setDraft(null);
        setMessage(null);
        setComposeDraft(null);
        writeEmailComposeSession({
          sessionId: composeSession.sessionId,
          draftId: null,
          inboxId: composeInboxId || null,
        });
        if (!isCompose) {
          navigate("/email", { replace: true });
        }
      } catch (caught) {
        setSendError(
          caught instanceof Error ? caught.message : "Could not delete draft.",
        );
        console.warn("[email] delete draft failed:", caught);
      } finally {
        deletingRef.current = false;
        setDeleting(false);
      }
    },
    [client, composeInboxId, composeSession.sessionId, draftId, inboxId, isCompose, navigate, reloadMessageDetail],
  );

  const leaveMessageAfterRemoval = useCallback(() => {
    setMessage(null);
    setDraft(null);
    setThreadComments([]);
    requestMailboxReload();
    navigate("/email", { replace: true });
  }, [navigate]);

  const handleDeleteMessage = useCallback(async () => {
    if (!inboxId || !messageId) {
      return { ok: false as const, error: "Message is required." };
    }
    try {
      await client.requestJson(
        `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      );
      leaveMessageAfterRemoval();
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete email.",
      };
    }
  }, [client, inboxId, leaveMessageAfterRemoval, messageId]);

  const handleReportSpam = useCallback(async () => {
    if (!inboxId || !messageId) {
      return { ok: false as const, error: "Message is required." };
    }
    try {
      await client.requestJson(
        `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/report-spam`,
        { method: "POST" },
      );
      leaveMessageAfterRemoval();
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Failed to report email as spam.",
      };
    }
  }, [client, inboxId, leaveMessageAfterRemoval, messageId]);

  const emailExtraMenuItems = useMemo((): EntityExtraMenuItem[] => {
    if (!message || !inboxId || !messageId) return [];
    const subjectLabel =
      message.subject.trim() || "this email";
    return [
      {
        id: "report-spam",
        label: "Report spam",
        danger: true,
        confirm: {
          entityLabel: subjectLabel,
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
      setDeletingCommentId(commentId);
      setConceptError(null);
      try {
        await client.requestJson(`${base}/${encodeURIComponent(commentId)}`, {
          method: "DELETE",
        });
        setThreadComments((current) =>
          current.filter((comment) => comment.id !== commentId),
        );
        setSelectedCommentId((current) =>
          current === commentId ? null : current,
        );
      } catch (caught) {
        setConceptError(
          caught instanceof Error
            ? caught.message
            : "Could not delete comment.",
        );
      } finally {
        setDeletingCommentId(null);
      }
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
    }) => {
      // Draft-only turns: show the reply email, never an acknowledgment comment.
      if (result.replyDraftBody?.trim()) {
        setConceptError(null);
        setReplyComposeOpen(true);
        await saveConceptReply(result.replyDraftBody);
        return;
      }
      if (result.commentBody.trim()) {
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
    [postThreadComment, saveConceptReply],
  );

  const {
    sendComment: sendCommentToAgent,
    working: commentAgentWorking,
    error: commentAgentError,
  } = useEmailThreadCommentAgent({
    taskId,
    message: messageWithComments,
    onResult: handleCommentAgentResult,
  });

  useEffect(() => {
    if (!commentAgentError) return;
    setConceptError(commentAgentError);
  }, [commentAgentError]);

  const handleSubmitThreadComment = useCallback(
    async (body: string) => {
      if (!message) return;
      setCommentSending(true);
      setConceptError(null);
      try {
        const created = await postThreadComment(body, "user");
        const nextComments = created
          ? [...threadComments, created]
          : threadComments;
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
        await sendCommentToAgent(body, {
          message: {
            ...message,
            threadComments: nextComments,
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
                    assignee?.name ??
                    message.threadMetadata.assigneeName ??
                    null,
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
                  body:
                    conceptBodyDraft.trim() || existingDraft.body,
                }
              : existingDraft,
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
      contactId,
      contacts,
      message,
      organizationId,
      organizations,
      postThreadComment,
      projectKey,
      projects,
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
            onAssistantTurnComplete={(text) => saveComposeDraft(text)}
          >
            {(slot) => (
              <div className="inbox-detail-body inbox-detail-body--email">
                {conceptSaving ? (
                  <p className="email-concept-badge">Saving compose draft…</p>
                ) : null}
                {conceptBodySaving ? (
                  <p className="email-concept-badge">Saving draft edits…</p>
                ) : null}
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
                  fieldsDisabled={conceptSaving || conceptBodySaving}
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
        {conceptSaving ? (
          <p className="email-concept-badge">Saving reply concept…</p>
        ) : null}
        {conceptBodySaving ? (
          <p className="email-concept-badge">Saving draft edits…</p>
        ) : null}
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
        name:
          mailbox.contactName?.trim() ||
          mailbox.displayName?.trim() ||
          mailbox.email,
        avatarSrc: mailbox.avatarSrc ?? null,
      };
    };
    const mailboxChipForInbox = (mailboxInboxId: string | null | undefined) => {
      const mailbox =
        composeMailboxes.find((entry) => entry.inboxId === mailboxInboxId) ??
        null;
      if (!mailbox) return null;
      return {
        name:
          mailbox.contactName?.trim() ||
          mailbox.displayName?.trim() ||
          mailbox.email,
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
        fieldsDisabled={conceptSaving || conceptBodySaving}
        actions={replyDraftActions}
      />
    ) : null;
    const replyTimestampMs = (() => {
      const raw = message.conceptDraft?.updatedAt;
      if (raw) {
        const parsed = Date.parse(raw);
        if (Number.isFinite(parsed)) return parsed;
      }
      // Open compose without a saved draft yet — keep it at the top.
      return replyActive ? Date.now() : 0;
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
        return {
          key: `email:${entry.messageId}`,
          at: Number.isFinite(parsed) ? parsed : 0,
          node: (
            <EmailThreadMessageCard
              subject={entry.subject.trim() || "(no subject)"}
              from={entry.from}
              to={toList}
              timestamp={entry.timestamp}
              body={emailMessageBody(entry)}
              fromContact={
                contactField === "from" ? threadContactPicker : null
              }
              toContact={contactField === "to" ? threadContactPicker : null}
              fromMailbox={fromMailboxChip}
              toMailbox={toMailboxChip}
            />
          ),
        };
      }),
      ...threadComments.map((comment) => {
        const parsed = Date.parse(comment.createdAt);
        return {
          key: `comment:${comment.id}`,
          at: Number.isFinite(parsed) ? parsed : 0,
          node: (
            <EmailThreadCommentBubble
              body={comment.body}
              author={comment.author}
              timestamp={comment.createdAt}
              authorName={
                comment.author === "agent" ? assigneeCommentName : null
              }
              authorAvatarSrc={
                comment.author === "agent" ? assigneeCommentAvatarSrc : null
              }
              selected={selectedCommentId === comment.id}
              onSelect={() => {
                setSelectedCommentId((current) =>
                  current === comment.id ? null : comment.id,
                );
              }}
              onDelete={() => {
                void deleteThreadComment(comment.id);
              }}
              onSaveEdit={(nextBody) => updateThreadComment(comment.id, nextBody)}
              deleting={deletingCommentId === comment.id}
              saving={savingCommentId === comment.id}
            />
          ),
        };
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
    ].sort((a, b) => b.at - a.at);
    const threadTimeline = (
      <div className="email-thread">
        {status}
        {timelineItems.map((item) => (
          <Fragment key={item.key}>{item.node}</Fragment>
        ))}
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
        <div className="email-detail-scroll-shell">
          <div className="email-detail-scrollport email-detail-scrollport--fade">
            <div className="email-detail-scroll-row">
              <div className="email-detail-main">{threadTimeline}</div>
              <ResizableSidePanel
                storageKey={EMAIL_PROPERTIES_PANEL_WIDTH_KEY}
                className="detail-properties-panel email-detail-properties-rail"
                edge="start"
                panelRef={propertiesRailRef}
              >
                <div className="detail-properties-panel__inner">
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
                  placeholder="Message the agent about this email…"
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
            entityLabel={message.subject.trim() || "this email"}
            confirmLabel="Delete"
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
