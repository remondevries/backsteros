import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { CrmActivity } from "@backsteros/contracts";

import { meetingDetailHref } from "../lib/detail-href";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useCrmActivityFeed } from "../lib/use-crm-data";
import { TextInput } from "./app-text-input";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";

type Props = {
  organizationId: string;
};

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const deltaSec = Math.round((Date.now() - then) / 1000);
  if (deltaSec < 45) return "just now";
  if (deltaSec < 3600) return `${Math.max(1, Math.round(deltaSec / 60))}m ago`;
  if (deltaSec < 86_400) return `${Math.round(deltaSec / 3600)}h ago`;
  if (deltaSec < 86_400 * 2) return "Yesterday";
  if (deltaSec < 86_400 * 7) return `${Math.round(deltaSec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(iso).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });
}

function mapItem(item: CrmActivity) {
  if (item.kind === "meeting") {
    return {
      id: item.id,
      kind: "meeting" as const,
      occurredAt: item.occurredAt,
      title: item.meetingTitle?.trim() || "Meeting",
      body: item.bodyPreview?.trim() || item.body?.trim() || undefined,
      meetingId: item.meetingId ?? undefined,
    };
  }
  return {
    id: item.id,
    kind: "note" as const,
    occurredAt: item.occurredAt,
    title: "Note",
    body: item.body?.trim() || item.bodyPreview?.trim() || undefined,
    meetingId: undefined as string | undefined,
  };
}

/** Organization Activity tab — CRM notes + meetings (desktop parity). */
export function OrganizationActivityPanel({ organizationId }: Props) {
  const router = useRouter();
  const {
    items,
    nextCursor,
    loading,
    error,
    loadMore,
    submitNote,
  } = useCrmActivityFeed("organization", organizationId, Boolean(organizationId));

  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const timeline = items.map(mapItem);

  const onSubmit = useCallback(async () => {
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitNote(body);
      setDraft("");
    } catch (reason) {
      setSubmitError(
        reason instanceof Error ? reason.message : "Could not save note.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitNote, submitting]);

  return (
    <KeyboardAwareScrollView
      style={ui.screen}
      contentContainerStyle={styles.content}
      keepEndVisibleWhileTyping
    >
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a note…"
          placeholderTextColor={colors.muted}
          multiline
          style={styles.composerInput}
        />
        <Pressable
          onPress={() => void onSubmit()}
          disabled={!draft.trim() || submitting}
          style={({ pressed }) => [
            styles.submitButton,
            (!draft.trim() || submitting) && styles.submitDisabled,
            pressed && draft.trim() ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save note"
        >
          <Text style={styles.submitLabel}>
            {submitting ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>
      {submitError ? <Text style={ui.error}>{submitError}</Text> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {loading && timeline.length === 0 ? (
        <ActivityIndicator color={colors.muted} style={{ marginTop: 24 }} />
      ) : null}
      {!loading && timeline.length === 0 ? (
        <Text style={ui.hint}>No activity yet. Add a note.</Text>
      ) : null}
      {timeline.map((item) => {
        const openable = item.kind === "meeting" && item.meetingId;
        const Card = openable ? Pressable : View;
        return (
          <Card
            key={item.id}
            style={styles.card}
            {...(openable
              ? {
                  onPress: () =>
                    router.push(meetingDetailHref(item.meetingId!)),
                  accessibilityRole: "button" as const,
                }
              : {})}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.kind}>
                {item.kind === "meeting" ? "Meeting" : "Note"}
              </Text>
              <Text style={styles.when}>
                {formatRelativeTime(item.occurredAt)}
              </Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
          </Card>
        );
      })}
      {nextCursor ? (
        <Pressable
          onPress={() => void loadMore()}
          style={styles.loadMore}
          accessibilityRole="button"
        >
          <Text style={styles.loadMoreLabel}>Load more</Text>
        </Pressable>
      ) : null}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  composer: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 10,
  },
  composerInput: {
    color: colors.foreground,
    fontSize: 16,
    minHeight: 72,
    textAlignVertical: "top",
  },
  submitButton: {
    alignSelf: "flex-end",
    backgroundColor: colors.foreground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  submitDisabled: { opacity: 0.4 },
  submitLabel: {
    color: colors.background,
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  kind: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  when: { color: colors.muted, fontSize: 12 },
  title: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  body: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 21,
  },
  loadMore: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  loadMoreLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
});
