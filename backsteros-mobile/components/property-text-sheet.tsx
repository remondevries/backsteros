import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../lib/theme";
import { useKeyboardBottomInset } from "../lib/use-keyboard-bottom-inset";
import { TextInput } from "./app-text-input";

type Props = {
  visible: boolean;
  title: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  autoCapitalize?: "none" | "characters" | "sentences" | "words";
  /** Normalize each keystroke (e.g. project key → uppercase alphanumerics). */
  normalize?: (value: string) => string;
  validate?: (value: string) => string | null;
  onSave: (value: string) => void | Promise<void>;
  onClose: () => void;
  /**
   * Render as an overlay inside a parent Modal (e.g. properties all-sheet).
   * Nested RN Modals do not stack reliably on iOS.
   */
  embedded?: boolean;
};

const SLIDE_MS = 280;
const FADE_MS = 220;

function TextEditorBody({
  title,
  draft,
  setDraft,
  placeholder,
  maxLength,
  autoCapitalize,
  normalize,
  error,
  bottomInset,
  keyboardHeight,
  embedded,
  style,
  onClose,
  onSave,
  saving,
}: {
  title: string;
  draft: string;
  setDraft: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  autoCapitalize?: "none" | "characters" | "sentences" | "words";
  normalize?: (value: string) => string;
  error: string | null;
  bottomInset: number;
  keyboardHeight: number;
  embedded?: boolean;
  style?: object;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Animated.View
      style={[
        styles.sheet,
        embedded ? styles.sheetEmbedded : styles.sheetModal,
        // Lift standalone modals above the keyboard. Embedded sheets ride the
        // parent properties card, which already lifts.
        !embedded && keyboardHeight > 0
          ? { marginBottom: keyboardHeight }
          : null,
        {
          paddingBottom: Math.max(bottomInset, 16),
        },
        style,
      ]}
    >
      <Pressable
        style={styles.sheetPressable}
        onPress={(event) => event.stopPropagation()}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.title}>{title}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeLabel}>Back</Text>
          </Pressable>
        </View>

        <TextInput
          value={draft}
          onChangeText={(next: string) =>
            setDraft(normalize ? normalize(next) : next)
          }
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          autoFocus
          autoCorrect={false}
          autoCapitalize={autoCapitalize ?? "none"}
          maxLength={maxLength}
          editable={!saving}
          onSubmitEditing={onSave}
          returnKeyType="done"
          style={styles.input}
          accessibilityLabel={title}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveButton,
            pressed ? styles.saveButtonPressed : null,
            saving ? styles.saveButtonDisabled : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save"
        >
          <Text style={styles.saveLabel}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

/** Bottom sheet for editing a free-text property — modal or embedded overlay. */
export function PropertyTextSheet({
  visible,
  title,
  value,
  placeholder,
  maxLength,
  autoCapitalize,
  normalize,
  validate,
  onSave,
  onClose,
  embedded = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardBottomInset();
  const [mounted, setMounted] = useState(visible);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const slide = useRef(new Animated.Value(visible ? 0 : 1)).current;
  const fade = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setDraft(normalize ? normalize(value) : value);
      setError(null);
      setSaving(false);
      setMounted(true);
      slide.setValue(1);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0,
          duration: SLIDE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!mounted) return;

    Animated.parallel([
      Animated.timing(slide, {
        toValue: 1,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [fade, mounted, normalize, slide, value, visible]);

  async function handleSave() {
    const next = normalize ? normalize(draft) : draft.trim();
    setDraft(next);
    if (next === value) {
      onClose();
      return;
    }
    const validationError = validate?.(next) ?? null;
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  const slideDistance = Dimensions.get("window").height * 0.5;
  const sheetMotion = {
    transform: [
      {
        translateY: slide.interpolate({
          inputRange: [0, 1],
          outputRange: [0, slideDistance],
        }),
      },
    ],
  };

  const body = (
    <TextEditorBody
      title={title}
      draft={draft}
      setDraft={setDraft}
      placeholder={placeholder}
      maxLength={maxLength}
      autoCapitalize={autoCapitalize}
      normalize={normalize}
      error={error}
      bottomInset={insets.bottom}
      keyboardHeight={keyboardHeight}
      embedded={embedded}
      style={sheetMotion}
      onClose={onClose}
      onSave={() => {
        void handleSave();
      }}
      saving={saving}
    />
  );

  if (embedded) {
    return (
      <View style={styles.embeddedRoot} pointerEvents="box-none">
        <Animated.View
          pointerEvents={visible ? "auto" : "none"}
          style={[styles.embeddedBackdrop, { opacity: fade }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        {body}
      </View>
    );
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Animated.View
          pointerEvents={visible ? "auto" : "none"}
          style={[styles.modalBackdropFill, { opacity: fade }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        {body}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  embeddedRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 20,
  },
  embeddedBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.surface,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  sheetModal: {
    maxHeight: "70%",
  },
  sheetEmbedded: {
    maxHeight: "85%",
  },
  sheetPressable: {
    gap: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  closeLabel: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "500",
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.foreground,
    fontSize: 16,
    fontFamily: "Menlo",
    letterSpacing: 0.5,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  saveButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.accent,
    paddingVertical: 12,
  },
  saveButtonPressed: {
    opacity: 0.85,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
