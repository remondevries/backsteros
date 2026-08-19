import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  AgentMailDraftDetail,
  AgentMailMessageDetail,
  EmailSendDraftResponse,
  EmailThreadMetadata,
} from "@backsteros/contracts";
import {
  EmailDraftActions,
  EmailComposeChrome,
  RegisterPageTitle,
  EmailThreadMessageCard,
  EmailMessageReplyBar,
  getEmailItemHref,
  DetailWithPropertiesLayout,
  EmailPropertiesDisplay,
  EMAIL_PROPERTIES_PANEL_WIDTH_KEY,
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  migrateLegacyTaskStatus,
  isEmailComposePath,
  parseReplyToAddress,
  replySubject as formatReplySubject,
  type TaskStatus,
  type EmailDraftBodyMode,
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
import { useDesktopApi } from "../lib/api-context";
import { createRequestAbortSignal } from "../lib/request-timeout";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { useAgentMailMailboxes } from "../lib/use-agentmail-mailboxes";
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
  const { organizations, contacts } = workspace;
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
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
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

  useEffect(() => {
    const metadata = message?.threadMetadata;
    setStatusOverride(null);
    setOrganizationId(metadata?.organizationId ?? null);
    setContactId(metadata?.contactId ?? null);
    setAssigneeId(metadata?.assigneeId ?? null);
  }, [message?.messageId, message?.threadMetadata]);

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
      status?: TaskStatus;
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
        await client.requestJson(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/concept-reply`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: agentBody }),
          },
        );
        const reloaded = await client.requestJson<AgentMailMessageDetail>(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
        );
        setMessage(reloaded);
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

  const handleStartReply = useCallback(() => {
    if (!message) return;
    setReplyInboxId(inboxId?.trim() || agentMail.mailboxes[0]?.inboxId || "");
    setReplyTo(parseReplyToAddress(message.from));
    setReplySubjectText(formatReplySubject(message.subject));
    setConceptBodyMode("edit");
    setReplyComposeOpen(true);
  }, [agentMail.mailboxes, inboxId, message]);

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
    const body = emailMessageBody(message);
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
    const originalMessage = (
      <EmailThreadMessageCard
        subject={message.subject.trim() || "(no subject)"}
        from={message.from}
        to={message.inboxEmail ? [message.inboxEmail] : []}
        timestamp={message.timestamp}
        body={body || ""}
      />
    );
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
    const threadBody =
      replyActive && taskId ? (
        <DesktopEmailComposeLayout
          taskId={taskId}
          message={message}
          promptDisabled={conceptSaving || conceptBodySaving}
          promptPlaceholder="Describe the reply you want…"
          onAssistantTurnComplete={(text) => saveConceptReply(text)}
        >
          {(slot) => (
            <div className="inbox-detail-body inbox-detail-body--email">
              <div className="email-thread">
                {status}
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
                  fieldsDisabled={conceptSaving || conceptBodySaving}
                  agentWorking={slot.agentWorking}
                  composer={slot.agentPrompt}
                  actions={replyDraftActions}
                />
                {originalMessage}
              </div>
            </div>
          )}
        </DesktopEmailComposeLayout>
      ) : (
        <div className="inbox-detail-body inbox-detail-body--email">
          <div className="email-thread">
            {status}
            <EmailMessageReplyBar onReply={handleStartReply} />
            {originalMessage}
          </div>
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
    content = (
      <div
        className="email-detail-split"
        data-content-detail
        data-detail-split=""
      >
        <DetailWithPropertiesLayout
          storageKey={EMAIL_PROPERTIES_PANEL_WIDTH_KEY}
          main={threadBody}
          properties={
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
                assigneeId,
                assigneeName:
                  linkedAssignee?.name ?? metadata?.assigneeName ?? null,
                status:
                  statusOverride ??
                  migrateLegacyTaskStatus(metadata?.status ?? "triage"),
              }}
              organizationOptions={organizationOptions}
              contactOptions={contactOptions}
              assigneeOptions={assigneeOptions}
              organizationNavigateHref={
                organizationId ? `/organizations/${organizationId}` : null
              }
              contactNavigateHref={
                contactId ? `/contacts/${contactId}` : null
              }
              assigneeNavigateHref={
                assigneeId ? `/contacts/${assigneeId}` : null
              }
              onStatusChange={(next) => {
                setStatusOverride(next);
                void patchThreadMetadata({ status: next });
              }}
              onOrganizationChange={(next) => {
                setOrganizationId(next);
                void patchThreadMetadata({ organizationId: next });
              }}
              onContactChange={(next) => {
                setContactId(next);
                void patchThreadMetadata({ contactId: next });
              }}
              onAssigneeChange={(next) => {
                setAssigneeId(next);
                void patchThreadMetadata({ assigneeId: next });
              }}
              onCreateOrganizationFromQuery={(query) => {
                void workspace.createOrganization({ name: query }).then((created) => {
                  setOrganizationId(created.id);
                  void patchThreadMetadata({ organizationId: created.id });
                });
              }}
              onCreateContactFromQuery={(query) => {
                void workspace
                  .createContact({
                    name: query,
                    organizationId: organizationId ?? undefined,
                  })
                  .then((created) => {
                    setContactId(created.id);
                    void patchThreadMetadata({ contactId: created.id });
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
          }
        />
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
      <div className="inbox-detail-layout">{content}</div>
    </>
  );

  return detail;
}
