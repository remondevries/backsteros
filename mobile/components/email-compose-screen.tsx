import type {
  EmailComposeDraftResponse,
  EmailConceptReplyResponse,
  EmailSendDraftResponse,
} from "@backsteros/contracts";
import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAgentMail } from "../lib/agentmail-context";
import { isPadDevice } from "../lib/device";
import { emailMailboxLabel, emailPartyLabel } from "../lib/email-list";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { dispatchEmailListReload } from "../lib/use-agentmail-mailboxes";
import { TextInput } from "./app-text-input";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";

type Props = {
  /** Preselected mailbox (reply always has one). */
  inboxId?: string;
  /** Reply mode: the message being replied to. */
  replyToMessageId?: string;
  /** Reply mode: original subject / sender for the header line. */
  subject?: string;
  replyToFrom?: string;
};

/**
 * Compose a new email or reply to a thread. New: compose-draft → send.
 * Reply: concept-reply → send draft (desktop compose parity, sized down).
 */
export function EmailComposeScreen({
  inboxId: initialInboxId,
  replyToMessageId,
  subject: initialSubject,
  replyToFrom,
}: Props) {
  const client = useMobileApiClient();
  const router = useRouter();
  const segments = useSegments();
  const { mailboxes } = useAgentMail();
  const isReply = Boolean(replyToMessageId);
  // Compose opens from the Email section, Inbox, or Tasks stack — fall back
  // to whichever section it was opened in.
  const sectionBase = (segments as string[]).includes("inbox")
    ? ("/(app)/inbox" as const)
    : (segments as string[]).includes("tasks")
      ? ("/(app)/tasks" as const)
      : ("/(app)/email" as const);

  const [inboxId, setInboxId] = useState(
    initialInboxId || mailboxes[0]?.inboxId || "",
  );
  const [mailboxPickerOpen, setMailboxPickerOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const canSend = isReply
    ? body.trim().length > 0 && Boolean(inboxId) && !sending
    : body.trim().length > 0 &&
      to.trim().length > 0 &&
      Boolean(inboxId) &&
      !sending;

  const onSend = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      let draftId: string;
      if (isReply && replyToMessageId) {
        const concept = await client.requestJson<EmailConceptReplyResponse>(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(replyToMessageId)}/concept-reply`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: body.trim() }),
          },
        );
        draftId = concept.draftId;
      } else {
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
        draftId = draft.draftId;
      }

      const sent = await client.requestJson<EmailSendDraftResponse>(
        `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}/send`,
        { method: "POST" },
      );
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
    body,
    canSend,
    client,
    inboxId,
    isReply,
    replyToMessageId,
    router,
    sectionBase,
    subject,
    to,
  ]);

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions({ embedded: isPadDevice() }),
          title: isReply ? "Reply" : "New email",
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
                  style={styles.fieldInput}
                />
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Subject</Text>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="Subject"
                  placeholderTextColor={colors.muted}
                  style={styles.fieldInput}
                />
              </View>
            </>
          ) : null}

          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={isReply ? "Write your reply…" : "Write your email…"}
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            style={styles.bodyInput}
          />

          {error ? <Text style={ui.error}>{error}</Text> : null}

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
      </KeyboardAwareScrollView>

      <PropertyOptionSheet
        visible={mailboxPickerOpen}
        title="Mailbox"
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
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  replyContext: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 14,
    width: 60,
  },
  fieldValue: {
    color: colors.foreground,
    fontSize: 15,
    flex: 1,
  },
  fieldInput: {
    color: colors.foreground,
    fontSize: 15,
    flex: 1,
    paddingVertical: 2,
  },
  bodyInput: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 220,
    paddingVertical: 4,
  },
  sendButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.foreground,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 110,
    alignItems: "center",
  },
  sendLabel: {
    color: colors.background,
    fontSize: 15,
    fontWeight: "600",
  },
});
