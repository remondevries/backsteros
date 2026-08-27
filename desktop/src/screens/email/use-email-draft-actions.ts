import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  AgentMailDraftDetail,
  AgentMailMessageDetail,
  EmailSendDraftResponse,
} from "@backsteros/contracts";
import {
  parseReplyToAddress,
  replySubject as formatReplySubject,
  type EmailDraftBodyMode,
} from "@backsteros/ui";

import {
  extractAgentReplyBody,
  resolveEditableEmailDraftBody,
} from "../../lib/agent/email-agent-prompt";
import { useDesktopApi } from "../../lib/api-context";
import { useAgentMail } from "../../lib/agentmail-context";
import {
  readEmailComposeSession,
  resetEmailComposeSession,
  writeEmailComposeSession,
} from "../../lib/email-compose-session";
import { createRequestAbortSignal } from "../../lib/request-timeout";
import { dispatchEmailListPatch } from "../../lib/use-agentmail-mailboxes";

import { requestMailboxReload } from "./email-page-helpers";
import { navigateToHref } from "../../router/navigate-href";

export function useEmailDraftActions({
  inboxId,
  messageId,
  draftId,
  isCompose,
  message,
  setMessage,
  draft,
  setDraft,
  reloadMessageDetail,
  promoteEmailThreadStatus,
  toEmailDetailHref,
}: {
  inboxId: string | undefined;
  messageId: string | undefined;
  draftId: string | undefined;
  isCompose: boolean;
  message: AgentMailMessageDetail | null;
  setMessage: Dispatch<SetStateAction<AgentMailMessageDetail | null>>;
  draft: AgentMailDraftDetail | null;
  setDraft: Dispatch<SetStateAction<AgentMailDraftDetail | null>>;
  reloadMessageDetail: (
    messageInboxId: string,
    reloadMessageId: string,
  ) => Promise<AgentMailMessageDetail>;
  promoteEmailThreadStatus: (
    next: "in_progress" | "in_review" | "on_hold",
  ) => void;
  toEmailDetailHref: (
    targetInboxId: string,
    targetMessageId: string,
  ) => string;
}) {
  const { client } = useDesktopApi();
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const agentMail = useAgentMail();
  const [conceptError, setConceptError] = useState<string | null>(null);
  const [conceptSaving, setConceptSaving] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  return {
    conceptError,
    setConceptError,
    conceptSaving,
    sendError,
    sending,
    deleting,
    conceptBodyDraft,
    setConceptBodyDraft,
    conceptBodyMode,
    conceptBodySaving,
    draftStageWorking,
    setDraftStageWorking,
    composeSession,
    composeInboxId,
    setComposeInboxId,
    composeTo,
    setComposeTo,
    composeSubject,
    setComposeSubject,
    composeDraft,
    composeLoading,
    replyComposeOpen,
    setReplyComposeOpen,
    replyInboxId,
    setReplyInboxId,
    replyTo,
    setReplyTo,
    replySubjectText,
    setReplySubjectText,
    saveConceptDraftBody,
    handleConceptBodyModeChange,
    saveConceptReply,
    saveComposeDraft,
    sendDraft,
    deleteDraft,
  };
}
