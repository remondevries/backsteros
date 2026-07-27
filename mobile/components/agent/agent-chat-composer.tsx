import { useCallback } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { AgentModelPicker } from "./agent-model-picker";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  running?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onModelChange?: (modelId: string) => void;
};

function SendIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        stroke="#0a0a0a"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function StopIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Rect x={4.25} y={4.25} width={5.5} height={5.5} rx={1} fill="#fff" />
    </Svg>
  );
}

export function AgentChatComposer({
  value,
  onChange,
  onSend,
  onCancel,
  running = false,
  disabled = false,
  placeholder = "Message the agent…",
  onModelChange,
}: Props) {
  const canSend = Boolean(value.trim()) && !running && !disabled;

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    onSend();
  }, [canSend, onSend]);

  return (
    <View style={styles.root}>
      <View style={[styles.shell, disabled ? styles.shellInactive : null]}>
        <View style={styles.inputRow}>
          <TextInput
            value={value}
            onChangeText={onChange}
            editable={!disabled}
            placeholder={placeholder}
            placeholderTextColor="rgba(163,163,163,0.85)"
            multiline
            style={styles.input}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSubmit}
            accessibilityLabel="Agent chat message"
          />
          {running && onCancel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel agent turn"
              onPress={onCancel}
              style={({ pressed }) => [
                styles.action,
                styles.cancel,
                pressed ? styles.actionPressed : null,
              ]}
            >
              <StopIcon />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={!canSend}
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.action,
                styles.send,
                !canSend ? styles.sendDisabled : null,
                pressed && canSend ? styles.actionPressed : null,
              ]}
            >
              <SendIcon />
            </Pressable>
          )}
        </View>
        <View style={styles.toolbar}>
          <AgentModelPicker
            disabled={disabled}
            onModelChange={onModelChange}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: "transparent",
  },
  shell: {
    borderRadius: 22,
    backgroundColor: "#12141a",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  shellInactive: {
    opacity: 0.72,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 10,
    paddingTop: 10,
    paddingBottom: 6,
  },
  input: {
    flex: 1,
    minHeight: 22,
    maxHeight: 120,
    padding: 0,
    margin: 0,
    color: "#f7f9ff",
    fontSize: 15,
    lineHeight: 22,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 6,
    paddingRight: 10,
    paddingBottom: 8,
  },
  action: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPressed: {
    transform: [{ scale: 1.05 }],
  },
  send: {
    backgroundColor: "rgba(237,237,237,0.92)",
  },
  sendDisabled: {
    opacity: 0.3,
  },
  cancel: {
    backgroundColor: "rgba(220, 38, 38, 0.9)",
  },
});
