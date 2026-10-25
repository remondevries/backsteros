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
  buildEmailDraftHeaderPatch,
  normalizeEmailRecipients,
  parseReplyToAddress,
  replySubject as formatReplySubject,
  type EmailDraftBodyMode,
} from "@backsteros/ui";

import {
  extractAgentReplyBody,
  resolveEditableEmailDraftBody,
} from "../../lib/email-draft-body";
import { useDesktopApi } from "../../lib/api-context";
import { useAgentMail } from "../../lib/agentmail-context";
import {
  readEmailComposeSession,
  resetEmailComposeSession,
  writeEmailComposeSession,
} from "../../lib/email-compose-session";
import { createRequestAbortSignal } from "../../lib/request-timeout";
import { forgetEmailListRemoval } from "../../lib/email-list-pending-removals";
import {
  dispatchEmailListPatch,
  dispatchEmailListRemove,
} from "../../lib/use-agentmail-mailboxes";

import {
  emailRequestErrorMessage,
  requestMailboxReload,
} from "./email-page-helpers";
import {
  resolveEmailListReturnHref,
  type EmailListReturnHref,
} from "../../lib/email-list-return-href";
import { navigateToHref } from "../../router/navigate-href";
import { pinEmailThreadScrollDuringUpdate } from "./email-thread-scroll-pin";

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
  listReturnHref = "/inbox",
  onComposeFinished,
  composeDraftSeed = null,
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
  /**
   * Where compose navigates after send/delete of a standalone draft.
   * Pass a function `(removedDraftId) => href` to resolve the neighbor from
   * the live list before the optimistic remove lands.
   */
  listReturnHref?: EmailListReturnHref;
  /** Embedded compose: leave create mode without a full-page route change. */
  onComposeFinished?: () => void;
  /** Re-open an existing draft in compose (Communication list card). */
  composeDraftSeed?: { inboxId: string; draftId: string } | null;
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
  const [composeSession] = useState(() => {
    const seedDraftId = composeDraftSeed?.draftId?.trim();
    const seedInboxId = composeDraftSeed?.inboxId?.trim();
    if (isCompose && seedDraftId && seedInboxId) {
      const seeded: ReturnType<typeof readEmailComposeSession> = {
        sessionId: crypto.randomUUID(),
        draftId: seedDraftId,
        inboxId: seedInboxId,
        prefill: null,
      };
      writeEmailComposeSession(seeded);
      return seeded;
    }
    return readEmailComposeSession();
  });
  const [conceptBodyDraft, setConceptBodyDraft] = useState(
    () => composeSession.prefill?.body?.trim() ?? "",
  );
  const [conceptBodyMode, setConceptBodyMode] =
    useState<EmailDraftBodyMode>(() => (isCompose ? "edit" : "preview"));
  const [conceptBodySaving, setConceptBodySaving] = useState(false);
  const [draftStageWorking, setDraftStageWorking] = useState(false);
  const conceptSavingRef = useRef(false);
  const conceptBodySavingRef = useRef(false);
  const sendingRef = useRef(false);
  const deletingRef = useRef(false);
  const [composeInboxId, setComposeInboxId] = useState(
    () => composeSession.inboxId ?? "",
  );
  // Seed from session prefill synchronously so compose chrome never autofocuses
  // To for one frame before Forward/new-mail prefill arrives.
  const [composeTo, setComposeTo] = useState(
    () => composeSession.prefill?.to?.trim() ?? "",
  );
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [composeSubject, setComposeSubject] = useState(
    () => composeSession.prefill?.subject?.trim() ?? "",
  );
  const [composeDraft, setComposeDraft] = useState<AgentMailDraftDetail | null>(
    null,
  );
  const [composeLoading, setComposeLoading] = useState(
    Boolean(isCompose && composeSession.draftId && composeSession.inboxId),
  );
  const [replyComposeOpen, setReplyComposeOpen] = useState(false);
  const [replyInboxId, setReplyInboxId] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [replyCc, setReplyCc] = useState("");
  const [replySubjectText, setReplySubjectText] = useState("");
  const conceptBodyModeRef = useRef(conceptBodyMode);
  conceptBodyModeRef.current = conceptBodyMode;
  /** Last body we successfully PATCH'd — ignore stale reloads until the server matches. */
  const lastSavedConceptRef = useRef<{
    body: string;
    updatedAt: string;
  } | null>(null);

  // Re-seed on draft field changes only; poll reloads hand us new objects with
  // the same content and must not re-run this.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const conceptDraftRef = useRef(message?.conceptDraft);
  conceptDraftRef.current = message?.conceptDraft;

  useEffect(() => {
    const draft = draftRef.current;
    const conceptDraft = conceptDraftRef.current;
    const editableBody =
      resolveEditableEmailDraftBody(draft) ||
      resolveEditableEmailDraftBody(conceptDraft);
    const serverUpdatedAt =
      draft?.updatedAt ?? conceptDraft?.updatedAt ?? "";
    const editing = conceptBodyModeRef.current === "edit";
    setConceptBodyDraft((current) => {
      // Keep a locally painted agent body while message detail catches up —
      // wiping to "" flashes the empty "Message the agent…" shell.
      if (!editableBody.trim() && current.trim()) return current;
      const saved = lastSavedConceptRef.current;
      if (saved != null && editableBody === saved.body) {
        lastSavedConceptRef.current = null;
      } else if (
        saved != null &&
        current === saved.body &&
        editableBody !== saved.body &&
        (!serverUpdatedAt || serverUpdatedAt <= saved.updatedAt)
      ) {
        // Open-thread poll / mailbox reload still has the pre-edit snapshot.
        return current;
      } else if (
        saved != null &&
        serverUpdatedAt &&
        serverUpdatedAt > saved.updatedAt
      ) {
        // Newer server revision (e.g. agent rewrite) — adopt it.
        lastSavedConceptRef.current = null;
      }
      // Do not clobber in-progress edits when a stale message reload arrives.
      if (editing && current.trim() && current !== editableBody) {
        return current;
      }
      return editableBody;
    });
    // Identity / server updates jump back to preview — but not while the user
    // is mid-edit (Preview itself flips the mode after save).
    if (!editing) {
      setConceptBodyMode("preview");
    }
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

  const replyHeadersSeededForDraftRef = useRef<string | null>(null);

  useEffect(() => {
    setReplyComposeOpen(false);
    setReplyInboxId("");
    setReplyTo("");
    setReplyCc("");
    setReplySubjectText("");
    replyHeadersSeededForDraftRef.current = null;
  }, [messageId]);

  useEffect(() => {
    if (!message || isCompose) return;
    const concept = message.conceptDraft;
    if (!concept) return;
    setReplyComposeOpen(true);
    setReplyInboxId(concept.inboxId?.trim() || inboxId || "");
    // Seed To / Cc / Subject once per draft id — agent body rewrites must not
    // clobber recipients the user already edited.
    if (replyHeadersSeededForDraftRef.current === concept.draftId) return;
    replyHeadersSeededForDraftRef.current = concept.draftId;
    // Keep Reply-all / manual header edits made before the first draft id arrives.
    setReplyTo((current) =>
      current.trim()
        ? current
        : (concept.to ?? []).join(", ") || parseReplyToAddress(message.from),
    );
    setReplyCc((current) =>
      current.trim() ? current : (concept.cc ?? []).join(", "),
    );
    setReplySubjectText((current) =>
      current.trim()
        ? current
        : concept.subject?.trim() || formatReplySubject(message.subject),
    );
  }, [
    inboxId,
    isCompose,
    message,
    message?.conceptDraft?.draftId,
    message?.conceptDraft?.to,
    message?.conceptDraft?.cc,
    message?.conceptDraft?.subject,
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
        setComposeTo((loaded.to ?? []).join(", "));
        setComposeCc((loaded.cc ?? []).join(", "));
        setComposeBcc((loaded.bcc ?? []).join(", "));
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

  const composeDraftRef = useRef(composeDraft);
  composeDraftRef.current = composeDraft;

  useEffect(() => {
    if (!isCompose) return;
    const editableBody = resolveEditableEmailDraftBody(composeDraftRef.current);
    const editing = conceptBodyModeRef.current === "edit";
    setConceptBodyDraft((current) => {
      if (!editableBody.trim() && current.trim()) return current;
      if (editing && current.trim() && current !== editableBody) {
        return current;
      }
      return editableBody;
    });
    // Keep the user's Preview/Edit choice; only seed "edit" for a brand-new compose.
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

  /** True when this screen owns editable To / Cc / Subject chrome. */
  const ownsDraftHeaders = Boolean(
    isCompose || composeDraft?.draftId || (message && replyComposeOpen),
  );

  const draftHeaderPayload = useCallback(
    (options?: { includeBody?: string; onlyChanged?: boolean }) => {
      const usingCompose = Boolean(isCompose || composeDraft?.draftId);
      const baseline = composeDraft ?? draft ?? message?.conceptDraft ?? null;
      return buildEmailDraftHeaderPatch({
        ownsHeaders: ownsDraftHeaders,
        onlyChanged: options?.onlyChanged,
        to: usingCompose ? composeTo : replyTo,
        cc: usingCompose ? composeCc : replyCc,
        bcc: usingCompose ? composeBcc : "",
        subject: usingCompose ? composeSubject : replySubjectText,
        baseline,
        includeBody: options?.includeBody,
      });
    },
    [
      composeBcc,
      composeCc,
      composeDraft,
      composeSubject,
      composeTo,
      draft,
      isCompose,
      message?.conceptDraft,
      ownsDraftHeaders,
      replyCc,
      replySubjectText,
      replyTo,
    ],
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
            body: JSON.stringify(draftHeaderPayload({ includeBody: body })),
          },
        );
        const nextEditable =
          resolveEditableEmailDraftBody(updated) || body;
        lastSavedConceptRef.current = {
          body: nextEditable,
          updatedAt: updated.updatedAt,
        };
        if (draftId && draft) {
          setDraft(updated);
        } else if (composeDraft?.draftId) {
          setComposeDraft(updated);
          setComposeTo((updated.to ?? []).join(", "));
          setComposeCc((updated.cc ?? []).join(", "));
          setComposeBcc((updated.bcc ?? []).join(", "));
          setComposeSubject(updated.subject?.trim() ?? composeSubject);
        } else if (messageId && inboxId) {
          const reloaded = await reloadMessageDetail(inboxId, messageId);
          // Prefer the PATCH response over reload — message detail can lag and
          // would otherwise reset Preview back to the pre-edit body.
          setMessage({
            ...reloaded,
            conceptDraftId: updated.draftId ?? reloaded.conceptDraftId,
            conceptDraft: {
              draftId: updated.draftId,
              inboxId: updated.inboxId || inboxId,
              subject: updated.subject,
              from: updated.from ?? null,
              to: updated.to ?? [],
              cc: updated.cc ?? [],
              text: updated.text,
              body: nextEditable,
              greeting: updated.greeting ?? null,
              signOff: updated.signOff ?? null,
              preview: updated.preview,
              updatedAt: updated.updatedAt,
            },
          });
          setReplyTo((updated.to ?? []).join(", "));
          setReplyCc((updated.cc ?? []).join(", "));
          setReplySubjectText(
            updated.subject?.trim() ||
              formatReplySubject(reloaded.subject),
          );
        }
        setConceptBodyDraft(nextEditable);
        requestMailboxReload();
      } catch (caught) {
        setConceptError(
          emailRequestErrorMessage(caught, "Could not save draft changes."),
        );
        throw caught;
      } finally {
        conceptBodySavingRef.current = false;
        setConceptBodySaving(false);
      }
    },
    [
      client,
      composeDraft?.draftId,
      composeSubject,
      draft,
      draftHeaderPayload,
      draftId,
      inboxId,
      messageId,
      reloadMessageDetail,
      setDraft,
      setMessage,
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
        const headers = draftHeaderPayload();
        const saved = await client.requestJson<{
          draftId: string;
          inboxId: string;
          inReplyToMessageId?: string | null;
          to?: string[];
          cc?: string[];
          subject?: string | null;
        }>(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/concept-reply`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              body: agentBody,
              to: headers.to,
              cc: headers.cc,
              subject: headers.subject,
            }),
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
                  cc: draftDetail.cc ?? [],
                  text: draftDetail.text,
                  body: resolveEditableEmailDraftBody(draftDetail),
                  greeting: draftDetail.greeting ?? null,
                  signOff: draftDetail.signOff ?? null,
                  preview: draftDetail.preview,
                  updatedAt: draftDetail.updatedAt,
                },
              });
              setReplyTo((draftDetail.to ?? []).join(", "));
              setReplyCc((draftDetail.cc ?? []).join(", "));
              setReplySubjectText(
                draftDetail.subject?.trim() ||
                  formatReplySubject(message?.subject ?? ""),
              );
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
        setConceptError(
          emailRequestErrorMessage(caught, "Could not save reply concept."),
        );
        console.warn("[email] concept-reply failed:", caught);
      } finally {
        conceptSavingRef.current = false;
        setConceptSaving(false);
      }
    },
    [
      client,
      draftHeaderPayload,
      inboxId,
      message?.subject,
      messageId,
      setMessage,
    ],
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
              cc: normalizeEmailRecipients(composeCc),
              bcc: normalizeEmailRecipients(composeBcc),
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
        setComposeTo((loaded.to ?? []).join(", "));
        setComposeCc((loaded.cc ?? []).join(", "));
        setComposeBcc((loaded.bcc ?? []).join(", "));
        setComposeSubject(loaded.subject?.trim() ?? composeSubject);
        const nextEditable =
          resolveEditableEmailDraftBody(loaded) || agentBody;
        lastSavedConceptRef.current = {
          body: nextEditable,
          updatedAt: loaded.updatedAt,
        };
        setConceptBodyDraft(nextEditable);
        requestMailboxReload();
      } catch (caught) {
        setConceptError(
          emailRequestErrorMessage(caught, "Could not save compose draft."),
        );
        console.warn("[email] compose-draft failed:", caught);
      } finally {
        conceptSavingRef.current = false;
        setConceptSaving(false);
      }
    },
    [
      client,
      composeBcc,
      composeCc,
      composeInboxId,
      composeSession.sessionId,
      composeSubject,
      composeTo,
    ],
  );

  const handleConceptBodyModeChange = useCallback(
    async (mode: EmailDraftBodyMode) => {
      if (mode === conceptBodyMode) return;
      if (mode === "preview" && conceptBodyMode === "edit") {
        if (isCompose && !composeDraft?.draftId && conceptBodyDraft.trim()) {
          await saveComposeDraft(conceptBodyDraft);
          pinEmailThreadScrollDuringUpdate(() => {
            setConceptBodyMode(mode);
          });
          return;
        }
        const savedBody =
          resolveEditableEmailDraftBody(draft) ||
          resolveEditableEmailDraftBody(composeDraft) ||
          resolveEditableEmailDraftBody(message?.conceptDraft);
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
      pinEmailThreadScrollDuringUpdate(() => {
        setConceptBodyMode(mode);
      });
    },
    [
      conceptBodyDraft,
      conceptBodyMode,
      composeDraft,
      draft,
      inboxId,
      isCompose,
      message,
      saveConceptDraftBody,
      saveComposeDraft,
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
        // Only PATCH fields that changed. Never re-save an unchanged body —
        // OS-87 sends stored shelled drafts byte-for-byte.
        const baseline =
          composeDraft?.draftId === targetDraftId
            ? composeDraft
            : draft?.draftId === targetDraftId
              ? draft
              : message?.conceptDraft?.draftId === targetDraftId
                ? message.conceptDraft
                : null;
        const savedBody = resolveEditableEmailDraftBody(baseline);
        const bodyDirty =
          conceptBodyDraft.trim() !== savedBody.trim() &&
          // Standalone draft page edits body in conceptBodyDraft too.
          (ownsDraftHeaders || Boolean(draftId));
        const patch = draftHeaderPayload({
          onlyChanged: true,
          ...(bodyDirty ? { includeBody: conceptBodyDraft } : {}),
        });
        if (Object.keys(patch).length > 0) {
          await client.requestJson<AgentMailDraftDetail>(
            `/api/v1/email/inboxes/${encodeURIComponent(draftInboxId)}/drafts/${encodeURIComponent(targetDraftId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            },
          );
        }
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
            conceptDraftId: null,
          });
          // Close reply chrome immediately — send deletes the draft; a lingering
          // conceptDraft link from reload must not reopen the composer.
          setConceptBodyDraft("");
          setReplyComposeOpen(false);
          setReplyInboxId("");
          setReplyTo("");
          setReplyCc("");
          setReplySubjectText("");
          replyHeadersSeededForDraftRef.current = null;
          const reloaded = await reloadMessageDetail(targetInbox, returnToMessageId);
          setDraft(null);
          setComposeDraft(null);
          setMessage({
            ...reloaded,
            conceptDraft: null,
            conceptDraftId: null,
            conceptPreview: null,
          });
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
        // Remove the draft row so send does not leave a ghost in Communication.
        dispatchEmailListRemove({
          inboxId: draftInboxId,
          messageId: targetDraftId,
        });
        if (onComposeFinished) {
          onComposeFinished();
        }
        navigate(resolveEmailListReturnHref(listReturnHref, targetDraftId), {
          replace: true,
        });
      } catch (caught) {
        setSendError(
          emailRequestErrorMessage(caught, "Could not send draft."),
        );
        console.warn("[email] send draft failed:", caught);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [
      client,
      composeDraft,
      conceptBodyDraft,
      draft,
      draftHeaderPayload,
      draftId,
      inboxId,
      message?.conceptDraft,
      navigate,
      onComposeFinished,
      ownsDraftHeaders,
      promoteEmailThreadStatus,
      reloadMessageDetail,
      listReturnHref,
      setDraft,
      setMessage,
      toEmailDetailHref,
    ],
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
      setDeleting(true);
      setSendError(null);

      const returnToMessageId = reloadMessageId?.trim() || null;
      const parentMessageId =
        returnToMessageId ||
        message?.messageId?.trim() ||
        messageId?.trim() ||
        null;
      // Resolve neighbor while the draft row is still in the list.
      const nextHref = returnToMessageId
        ? null
        : resolveEmailListReturnHref(listReturnHref, resolvedDraftId);

      // Drop the draft list row (and tombstone) by draft id only — never pass
      // the parent threadId or a reply-concept delete would wipe the thread.
      dispatchEmailListRemove({
        inboxId: resolvedInboxId,
        messageId: resolvedDraftId,
      });

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
        setComposeDraft(null);
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
        if (onComposeFinished) {
          onComposeFinished();
        }
        if (nextHref) {
          navigate(nextHref, { replace: true });
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
            emailRequestErrorMessage(caught, "Could not delete draft."),
          );
          console.warn("[email] delete draft failed:", caught);
          forgetEmailListRemoval({
            inboxId: resolvedInboxId,
            messageId: resolvedDraftId,
          });
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
      message?.messageId,
      messageId,
      listReturnHref,
      setMessage,
      inboxId,
      client,
      setDraft,
      draftId,
      navigate,
      toEmailDetailHref,
      composeSession.sessionId,
      composeInboxId,
      onComposeFinished,
      reloadMessageDetail,
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
    composeCc,
    setComposeCc,
    composeBcc,
    setComposeBcc,
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
    replyCc,
    setReplyCc,
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
