import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors } from "../lib/theme";
import { TextInput } from "./app-text-input";

type Props = {
  onSubmit: (text: string) => void | Promise<void>;
  working?: boolean;
  disabled?: boolean;
  error?: string | null;
  placeholder?: string;
};

/**
 * Sticky composer for email-thread agent comments (desktop timeline parity).
 */
export function EmailThreadCommentComposer({
  onSubmit,
  working = false,
  disabled = false,
  error = null,
  placeholder = "Message the agent about this email…",
}: Props) {
  const [draft, setDraft] = useState("");
  const busy = working;
  const inputDisabled = disabled || busy;
  const submitDisabled = inputDisabled || !draft.trim();

  async function handleSubmit() {
    const text = draft.trim();
    if (!text || submitDisabled) return;
    setDraft("");
    await onSubmit(text);
  }

  return (
    <View style={styles.root}>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {busy ? (
        <Text style={styles.working} accessibilityLiveRegion="polite">
          Agent is working…
        </Text>
      ) : null}
      <View style={styles.shell}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          editable={!inputDisabled}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          style={styles.input}
          accessibilityLabel="Email thread comment"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? "Sending" : "Send comment"}
          accessibilityState={{ disabled: submitDisabled, busy }}
          disabled={submitDisabled}
          onPress={() => {
            void handleSubmit();
          }}
          style={({ pressed }) => [
            styles.send,
            submitDisabled ? styles.sendDisabled : null,
            pressed && !submitDisabled ? { opacity: 0.75 } : null,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.sendLabel}>↑</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  working: {
    color: colors.muted,
    fontSize: 13,
  },
  shell: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 6,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.foreground,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendLabel: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "700",
  },
});
