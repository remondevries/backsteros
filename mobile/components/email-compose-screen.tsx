import type {
  AgentMailDraftDetail,
  EmailComposeDraftResponse,
  EmailConceptReplyResponse,
  EmailSendDraftResponse,
} from "@backsteros/contracts";
import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAgentMail } from "../lib/agentmail-context";
import {
  emailComposeAgentTaskId,
  extractAgentReplyBody,
} from "../lib/agent/email-agent-prompt";
import { isPadDevice } from "../lib/device";
import { emailMailboxLabel, emailPartyLabel } from "../lib/email-list";
import {
  discardEmailDraftDetailCache,
  fetchEmailDraftDetail,
} from "../lib/email-message-detail";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { dispatchEmailListReload } from "../lib/use-agentmail-mailboxes";
import { TextInput } from "./app-text-input";
import { EmailAgentPrompt } from "./email-agent-prompt";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";

export type EmailComposeScreenProps = {
  /** Preselected mailbox (reply always has one). */
  inboxId?: string;
  /** Reply mode: the message being replied to. */
  replyToMessageId?: string;
  /** Reply mode: original subject / sender for the header line. */
  subject?: string;
  replyToFrom?: string;
  /** Reopen an existing AgentMail draft. */
  draftId?: string;
  /** Forward / new-compose prefill (subject + quoted body). */
  initialTo?: string;
  initialBody?: string;
  mode?: "compose" | "reply" | "forward";
};

/**
 * Compose, reply, or forward. Drafts are created on Save / first Send and can
 * be reopened via `draftId` (desktop draft persistence parity, sized for phone).
 */
export function EmailComposeScreen({
  inboxId: initialInboxId,
  replyToMessageId,
  subject: initialSubject,
  replyToFrom,
  draftId: initialDraftId,
  initialTo,
  initialBody,
  mode: modeProp,
}: EmailComposeScreenProps) {
  const client = useMobileApiClient();
  const router = useRouter();
  const segments = useSegments();
  const { mailboxes } = useAgentMail();

  const mode: "compose" | "reply" | "forward" =
    modeProp ??
    (replyToMessageId ? "reply" : initialBody || /^fwd:/i.test(initialSubject ?? "")
      ? "forward"
      : "compose");
  const isReply = mode === "reply";
  const isForward = mode === "forward";

  const sectionBase = (segments as string[]).includes("inbox")
    ? ("/(app)/inbox" as const)
    : (segments as string[]).includes("tasks")
      ? ("/(app)/tasks" as const)
      : ("/(app)/email" as const);

  const [inboxId, setInboxId] = useState(
    initialInboxId || mailboxes[0]?.inboxId || "",
  );
  const [mailboxPickerOpen, setMailboxPickerOpen] = useState(false);
  const [to, setTo] = useState(initialTo ?? "");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState(initialBody ?? "");
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [agentWorking, setAgentWorking] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(initialDraftId));
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const hydratedDraftRef = useRef<string | null>(null);

  const selectedMailbox = mailboxes.find(
    (mailbox) => mailbox.inboxId === inboxId,
  );

  const mailboxOptions = useMemo<PropertyOption<string>[]>(
    () =>
      mailboxes.map((mailbox) => ({
        value: mailbox.inboxId,
        label: `${emailMailboxLabel(mailbox)} — ${mailbox.email}`,
      })),
    [mailboxes],
  );

  useEffect(() => {
    if (!initialDraftId || !initialInboxId) {
      setLoadingDraft(false);
      return;
    }
    const key = `${initialInboxId}:${initialDraftId}`;
    if (hydratedDraftRef.current === key) return;
    hydratedDraftRef.current = key;
    let cancelled = false;
    setLoadingDraft(true);
    void fetchEmailDraftDetail(client, initialInboxId, initialDraftId, {
      force: true,
    }).then((detail: AgentMailDraftDetail | null) => {
      if (cancelled) return;
      if (!detail) {
        setError("Could not load draft.");
        setLoadingDraft(false);
        return;
      }
      setInboxId(detail.inboxId);
      setDraftId(detail.draftId);
      setTo(detail.to[0] ?? "");
      setSubject(detail.subject ?? "");
      setBody(detail.body ?? detail.text ?? "");
      setLoadingDraft(false);
    });
    return () => {
      cancelled = true;
    };
  }, [client, initialDraftId, initialInboxId]);

  const canSend = isReply
    ? body.trim().length > 0 &&
      Boolean(inboxId) &&
      !sending &&
      !loadingDraft &&
      !agentWorking
    : body.trim().length > 0 &&
      to.trim().length > 0 &&
      Boolean(inboxId) &&
      !sending &&
      !loadingDraft &&
      !agentWorking;

  const canSave =
    body.trim().length > 0 &&
    Boolean(inboxId) &&
    !saving &&
    !sending &&
    !loadingDraft &&
    !agentWorking &&
    (isReply || to.trim().length > 0);

  const title =
    isReply ? "Reply" : isForward ? "Forward" : draftId ? "Draft" : "New email";

  const composeContext = useMemo(
    () => ({
      fromEmail: selectedMailbox?.email ?? "",
      to: isReply ? replyToFrom ?? "" : to,
      subject,
      currentDraftBody: body.trim() || undefined,
    }),
    [body, isReply, replyToFrom, selectedMailbox?.email, subject, to],
  );

  const onAssistantTurnComplete = useCallback(
    async (text: string) => {
      const agentBody = extractAgentReplyBody(text) || text.trim();
      if (!agentBody) return;
      setBody(agentBody);
      setStatusHint(null);
      setError(null);

      if (!inboxId) return;
      if (!isReply && !to.trim()) {
        setStatusHint("Draft ready — add a recipient to save.");
        return;
      }

      setSaving(true);
      try {
        if (draftId) {
          await client.requestJson(
            `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body: agentBody }),
            },
          );
          discardEmailDraftDetailCache(inboxId, draftId);
        } else if (isReply && replyToMessageId) {
          const concept = await client.requestJson<EmailConceptReplyResponse>(
            `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(replyToMessageId)}/concept-reply`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body: agentBody }),
            },
          );
          setDraftId(concept.draftId);
        } else {
          const draft = await client.requestJson<EmailComposeDraftResponse>(
            `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/compose-draft`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: to.trim(),
                subject: subject.trim(),
                body: agentBody,
              }),
            },
          );
          setDraftId(draft.draftId);
        }
        setStatusHint("Draft updated.");
      } catch {
        setError("Could not save agent draft.");
      } finally {
        setSaving(false);
      }
    },
    [
      client,
      draftId,
      inboxId,
      isReply,
      replyToMessageId,
      subject,
      to,
    ],
  );

  const ensureDraft = useCallback(async (): Promise<string> => {
    if (draftId) {
      await client.requestJson(
        `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim() }),
        },
      );
      discardEmailDraftDetailCache(inboxId, draftId);
      return draftId;
    }

    if (isReply && replyToMessageId) {
      const concept = await client.requestJson<EmailConceptReplyResponse>(
        `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(replyToMessageId)}/concept-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim() }),
        },
      );
      setDraftId(concept.draftId);
      return concept.draftId;
    }

    const draft = await client.requestJson<EmailComposeDraftResponse>(
      `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/compose-draft`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
        }),
      },
    );
    setDraftId(draft.draftId);
    return draft.draftId;
  }, [
    body,
    client,
    draftId,
    inboxId,
    isReply,
    replyToMessageId,
    subject,
    to,
  ]);

  const onSaveDraft = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setStatusHint(null);
    try {
      await ensureDraft();
      setStatusHint("Draft saved");
      dispatchEmailListReload();
    } catch {
      setError("Could not save draft.");
    } finally {
      setSaving(false);
    }
  }, [canSave, ensureDraft]);

  const onSend = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    setStatusHint(null);
    try {
      const id = await ensureDraft();
      const sent = await client.requestJson<EmailSendDraftResponse>(
        `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(id)}/send`,
        { method: "POST" },
      );
      discardEmailDraftDetailCache(inboxId, id);
      dispatchEmailListReload();
      const targetMessageId =
        sent.inReplyToMessageId?.trim() || sent.messageId?.trim() || null;
      if (router.canGoBack()) {
        router.back();
      } else if (targetMessageId) {
        const inbox = encodeURIComponent(inboxId);
        const message = encodeURIComponent(targetMessageId);
        router.replace(
          sectionBase === "/(app)/inbox"
            ? (`/(app)/inbox/email/${inbox}/${message}` as const)
            : sectionBase === "/(app)/tasks"
              ? (`/(app)/tasks/email/${inbox}/${message}` as const)
              : (`/(app)/email/${inbox}/${message}` as const),
        );
      } else {
        router.replace(sectionBase);
      }
    } catch {
      setError("Could not send the email.");
      setSending(false);
    }
  }, [
    canSend,
    client,
    ensureDraft,
    inboxId,
    router,
    sectionBase,
  ]);

  const onDiscard = useCallback(() => {
    const run = async () => {
      if (!draftId) {
        if (router.canGoBack()) router.back();
        else router.replace(sectionBase);
        return;
      }
      setDiscarding(true);
      setError(null);
      try {
        await client.requestJson(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}`,
          { method: "DELETE" },
        );
        discardEmailDraftDetailCache(inboxId, draftId);
        dispatchEmailListReload();
        if (router.canGoBack()) router.back();
        else router.replace(sectionBase);
      } catch {
        setError("Could not discard draft.");
        setDiscarding(false);
      }
    };

    if (!draftId && !body.trim() && !to.trim()) {
      void run();
      return;
    }

    Alert.alert(
      "Discard draft?",
      draftId
        ? "Delete this draft from the mailbox?"
        : "Leave without saving?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            void run();
          },
        },
      ],
    );
  }, [body, client, draftId, inboxId, router, sectionBase, to]);

  if (loadingDraft) {
    return (
      <>
        <Stack.Screen
          options={{
            ...tabDetailScreenOptions({ embedded: isPadDevice() }),
            title,
          }}
        />
        <View style={ui.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions({ embedded: isPadDevice() }),
          title,
          headerRight: () => (
            <Pressable
              onPress={onDiscard}
              disabled={discarding || sending || agentWorking}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Discard"
              style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
            >
              <Text style={styles.headerAction}>
                {discarding ? "…" : "Discard"}
              </Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAwareScrollView style={ui.screen} keepEndVisibleWhileTyping>
        <View style={styles.form}>
          {isReply ? (
            <Text style={styles.replyContext} numberOfLines={2}>
              Replying to {replyToFrom ? emailPartyLabel(replyToFrom) : "thread"}
              {initialSubject?.trim() ? ` — ${initialSubject.trim()}` : ""}
            </Text>
          ) : null}
          {isForward ? (
            <Text style={styles.replyContext}>Forwarding message</Text>
          ) : null}

          {!initialInboxId && mailboxes.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose mailbox"
              onPress={() => setMailboxPickerOpen(true)}
              style={styles.fieldRow}
            >
              <Text style={styles.fieldLabel}>From</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {selectedMailbox
                  ? `${emailMailboxLabel(selectedMailbox)} — ${selectedMailbox.email}`
                  : "Choose mailbox"}
              </Text>
            </Pressable>
          ) : selectedMailbox ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>From</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {selectedMailbox.email}
              </Text>
            </View>
          ) : null}

          {!isReply ? (
            <>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>To</Text>
                <TextInput
                  value={to}
                  onChangeText={setTo}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!draftId && !agentWorking}
                  style={[styles.fieldInput, draftId ? styles.fieldLocked : null]}
                />
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Subject</Text>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="Subject"
                  placeholderTextColor={colors.muted}
                  editable={!draftId && !agentWorking}
                  style={[styles.fieldInput, draftId ? styles.fieldLocked : null]}
                />
              </View>
            </>
          ) : null}

          <TextInput
            value={body}
            onChangeText={(value) => {
              setBody(value);
              setStatusHint(null);
            }}
            placeholder={
              isReply
                ? "Write your reply…"
                : isForward
                  ? "Add a note above the forwarded message…"
                  : "Write your email…"
            }
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            editable={!agentWorking && !saving && !sending}
            style={styles.bodyInput}
          />

          <EmailAgentPrompt
            taskId={emailComposeAgentTaskId()}
            composeContext={composeContext}
            onAssistantTurnComplete={onAssistantTurnComplete}
            onWorkingChange={setAgentWorking}
            disabled={saving || sending || discarding || loadingDraft}
            contextLabel={draftId || body.trim() ? "Draft" : null}
            placeholder={
              draftId || body.trim()
                ? "Ask AI to update this draft…"
                : "Describe the email you want…"
            }
          />

          {statusHint ? <Text style={styles.hint}>{statusHint}</Text> : null}
          {error ? <Text style={ui.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save draft"
              onPress={() => {
                void onSaveDraft();
              }}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.secondaryButton,
                !canSave ? { opacity: 0.5 } : null,
                pressed ? { opacity: 0.8 } : null,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.foreground} size="small" />
              ) : (
                <Text style={styles.secondaryLabel}>
                  {draftId ? "Update draft" : "Save draft"}
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isReply ? "Send reply" : "Send email"}
              onPress={() => {
                void onSend();
              }}
              disabled={!canSend}
              style={({ pressed }) => [
                styles.sendButton,
                !canSend ? { opacity: 0.5 } : null,
                pressed ? { opacity: 0.8 } : null,
              ]}
            >
              {sending ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.sendLabel}>
                  {isReply ? "Send reply" : "Send"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>

      <PropertyOptionSheet
        visible={mailboxPickerOpen}
        title="From mailbox"
        options={mailboxOptions}
        selected={inboxId}
        onSelect={(value) => {
          setInboxId(value);
          setMailboxPickerOpen(false);
        }}
        onClose={() => setMailboxPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  replyContext: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: 10,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    width: 64,
  },
  fieldValue: {
    flex: 1,
    color: colors.foreground,
    fontSize: 15,
  },
  fieldInput: {
    flex: 1,
    color: colors.foreground,
    fontSize: 15,
    paddingVertical: 0,
  },
  fieldLocked: {
    opacity: 0.65,
  },
  bodyInput: {
    color: colors.foreground,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 180,
    paddingTop: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryLabel: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  sendButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.foreground,
  },
  sendLabel: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "600",
  },
  headerAction: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "500",
    paddingHorizontal: 4,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
  },
});
