import { useCallback, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { useAppleKeyCommand } from "../../lib/apple-key-commands";
import {
  useKeyEventListener,
  type KeyPressEvent,
  type KeyReleaseEvent,
} from "../../lib/key-event";
import { isPadDevice } from "../../lib/device";
import { colors } from "../../lib/theme";
import { AgentAccessPicker } from "./agent-access-picker";
import { AgentModePicker } from "./agent-mode-picker";
import { AgentModelPicker } from "./agent-model-picker";
import type { AgentChatAccessMode } from "../../lib/agent/agent-chat-access-mode";
import type { AgentChatMode } from "../../lib/agent/agent-chat-mode";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  running?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onModelChange?: (modelId: string) => void;
  agentMode?: AgentChatMode;
  onAgentModeChange?: (mode: AgentChatMode) => void;
  accessMode?: AgentChatAccessMode;
  onAccessModeChange?: (mode: AgentChatAccessMode) => void;
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

function isShiftKey(key: string): boolean {
  return (
    key === "Shift" ||
    key === "ShiftLeft" ||
    key === "ShiftRight" ||
    key === "ShiftLeftKey" ||
    key === "ShiftRightKey"
  );
}

function isEnterKey(key: string): boolean {
  return key === "Enter" || key === "NumpadEnter";
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
  agentMode,
  onAgentModeChange,
  accessMode,
  onAccessModeChange,
}: Props) {
  const canSend = Boolean(value.trim()) && !running && !disabled;
  const [focused, setFocused] = useState(false);
  /**
   * Fallback Shift tracking when UIKeyCommand is unavailable. Unreliable while
   * TextInput is first responder (expo-key-event often never sees presses).
   */
  const shiftHeldRef = useRef(false);
  /** Drop the newline TextInput inserts after Enter-to-send (fallback path). */
  const suppressNewlineRef = useRef(false);
  const canSendRef = useRef(canSend);
  canSendRef.current = canSend;
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const handleSubmit = useCallback(() => {
    if (!canSendRef.current) return;
    onSendRef.current();
  }, []);

  /**
   * iOS Magic Keyboard: bare Return is claimed by UIKeyCommand so Shift+Return
   * still reaches the TextInput as a newline. expo-key-event cannot see Shift
   * while the field is focused — same pattern as Escape shortcuts.
   */
  const sendCommand = useMemo(
    () => ({
      id: "agent-chat-composer-send",
      input: "return",
      modifiers: [] as Array<"command" | "control" | "option" | "shift">,
      title: "Send message",
    }),
    [],
  );

  useAppleKeyCommand(
    sendCommand,
    handleSubmit,
    focused && !disabled && !running && Platform.OS === "ios",
  );

  useKeyEventListener(
    useCallback((event: KeyPressEvent | KeyReleaseEvent) => {
      if (isShiftKey(event.key)) {
        shiftHeldRef.current = event.eventType === "press";
        return;
      }
      if (typeof event.shiftKey === "boolean") {
        shiftHeldRef.current = event.shiftKey;
      }
    }, []),
    {
      listenOnMount: true,
      captureModifiers: true,
      listenToRelease: true,
    },
  );

  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (!isEnterKey(event.nativeEvent.key)) return;
      // iOS: bare Enter is handled by UIKeyCommand when focused. Leave the
      // TextInput path alone so Shift+Enter can insert a newline.
      if (Platform.OS === "ios" && focused) return;

      const nativeShift = Boolean(
        (event.nativeEvent as { shiftKey?: boolean }).shiftKey,
      );
      if (nativeShift || shiftHeldRef.current) return;

      suppressNewlineRef.current = true;
      handleSubmit();
      setTimeout(() => {
        suppressNewlineRef.current = false;
      }, 100);
    },
    [focused, handleSubmit],
  );

  const handleChangeText = useCallback(
    (text: string) => {
      if (suppressNewlineRef.current) {
        suppressNewlineRef.current = false;
        return;
      }
      onChange(text);
    },
    [onChange],
  );

  return (
    <View
      style={[
        styles.root,
        isPadDevice() ? styles.rootPad : styles.rootPhone,
      ]}
    >
      <View style={[styles.shell, disabled ? styles.shellInactive : null]}>
        <View style={styles.inputRow}>
          <TextInput
            value={value}
            onChangeText={handleChangeText}
            onKeyPress={handleKeyPress}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            editable={!disabled}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            multiline
            style={styles.input}
            returnKeyType="default"
            blurOnSubmit={false}
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
          {agentMode && onAgentModeChange ? (
            <AgentModePicker
              mode={agentMode}
              onChange={onAgentModeChange}
              disabled={disabled || running}
            />
          ) : null}
          {accessMode && onAccessModeChange ? (
            <AgentAccessPicker
              mode={accessMode}
              onChange={onAccessModeChange}
              disabled={disabled || running}
            />
          ) : null}
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
    backgroundColor: "transparent",
  },
  rootPad: {
    paddingTop: 8,
    // Bottom gap to the floating nav comes from CodebaseTaskLayout
    // (pill height + PAD_CONTENT_INSET) — keep composer flush to that inset.
    paddingBottom: 0,
  },
  /** iPhone: sit on the home-indicator edge (slide already applies safe area). */
  rootPhone: {
    paddingTop: 6,
    paddingBottom: 2,
  },
  shell: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingLeft: 6,
    paddingRight: 10,
    paddingBottom: 8,
    gap: 4,
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
    backgroundColor: colors.buttonBg,
  },
  sendDisabled: {
    opacity: 0.3,
  },
  cancel: {
    backgroundColor: "rgba(220, 38, 38, 0.9)",
  },
});
