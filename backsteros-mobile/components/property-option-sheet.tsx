import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../lib/theme";
import { useKeyboardBottomInset } from "../lib/use-keyboard-bottom-inset";
import { TextInput } from "./app-text-input";

export type PropertyOption<T extends string | number | null> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

type Props<T extends string | number | null> = {
  visible: boolean;
  title: string;
  options: readonly PropertyOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  /**
   * Render as an overlay inside a parent Modal (e.g. properties all-sheet).
   * Nested RN Modals do not stack reliably on iOS.
   */
  embedded?: boolean;
  /** Override the search field placeholder. */
  searchPlaceholder?: string;
  /**
   * Optional free-text submit (e.g. natural-language due dates).
   * Return true when the query was applied (sheet closes).
   */
  onQuerySubmit?: (query: string) => boolean;
  /** Live preview label while typing a free-text query. */
  queryPreviewLabel?: (query: string) => string | null;
};

const SLIDE_MS = 280;
const FADE_MS = 220;

/** Height for a ~50% bottom sheet that still fits above the keyboard. */
function sheetHeightAboveKeyboard(
  windowHeight: number,
  keyboardHeight: number,
): number {
  const base = windowHeight * 0.5;
  if (keyboardHeight <= 0) return base;
  return Math.min(
    base,
    Math.max(windowHeight - keyboardHeight - 12, windowHeight * 0.32),
  );
}

function OptionList<T extends string | number | null>({
  title,
  options,
  selected,
  onSelect,
  onClose,
  bottomInset,
  embedded,
  style,
  searchPlaceholder,
  onQuerySubmit,
  queryPreviewLabel,
}: {
  title: string;
  options: readonly PropertyOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  bottomInset: number;
  embedded?: boolean;
  style?: object;
  searchPlaceholder?: string;
  onQuerySubmit?: (query: string) => boolean;
  queryPreviewLabel?: (query: string) => string | null;
}) {
  const [query, setQuery] = useState("");
  const keyboardHeight = useKeyboardBottomInset();
  const windowHeight = Dimensions.get("window").height;

  useEffect(() => {
    setQuery("");
  }, [title]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const queryPreview = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed || !queryPreviewLabel) return null;
    return queryPreviewLabel(trimmed);
  }, [query, queryPreviewLabel]);

  const applyQuery = () => {
    const trimmed = query.trim();
    if (!trimmed || !onQuerySubmit) return;
    if (onQuerySubmit(trimmed)) {
      onClose();
    }
  };

  return (
    <Animated.View
      style={[
        styles.sheet,
        embedded ? styles.sheetEmbedded : styles.sheetModal,
        !embedded && keyboardHeight > 0
          ? {
              height: sheetHeightAboveKeyboard(windowHeight, keyboardHeight),
              maxHeight: undefined,
              marginBottom: keyboardHeight,
            }
          : null,
        {
          // Safe-area only — keyboard lift uses marginBottom (modal) or parent sheet (embedded).
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

        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={
              searchPlaceholder ?? `Search ${title.toLowerCase()}…`
            }
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="done"
            onSubmitEditing={applyQuery}
            style={styles.searchInput}
            accessibilityLabel={`Search ${title}`}
          />
        </View>

        {queryPreview ? (
          <Pressable
            onPress={applyQuery}
            style={({ pressed }) => [
              styles.previewRow,
              pressed ? styles.rowPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={queryPreview}
          >
            <Text style={styles.previewLabel} numberOfLines={1}>
              {queryPreview}
            </Text>
            <Text style={styles.previewHint}>Tap to apply</Text>
          </Pressable>
        ) : null}

        <ScrollView
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {filtered.length === 0 ? (
            queryPreview ? null : (
              <Text style={styles.empty}>No matches.</Text>
            )
          ) : (
            filtered.map((option) => {
              const isSelected = option.value === selected;
              return (
                <Pressable
                  key={String(option.value)}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    isSelected ? styles.rowSelected : null,
                    pressed ? styles.rowPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={option.label}
                >
                  {option.icon ? (
                    <View style={styles.icon}>{option.icon}</View>
                  ) : null}
                  <Text
                    style={[
                      styles.label,
                      isSelected ? styles.labelSelected : null,
                    ]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </Pressable>
    </Animated.View>
  );
}

/** Bottom sheet for picking a property value — modal or embedded overlay. */
export function PropertyOptionSheet<T extends string | number | null>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  embedded = false,
  searchPlaceholder,
  onQuerySubmit,
  queryPreviewLabel,
}: Props<T>) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const slide = useRef(new Animated.Value(visible ? 0 : 1)).current;
  const fade = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
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
  }, [fade, mounted, slide, visible]);

  if (!mounted) return null;

  // Parent properties sheet is ~50% of the window — slide from below that.
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

  const listProps = {
    title,
    options,
    selected,
    onSelect,
    onClose,
    bottomInset: insets.bottom,
    searchPlaceholder,
    onQuerySubmit,
    queryPreviewLabel,
    style: sheetMotion,
  };

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
        <OptionList {...listProps} embedded />
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
        <OptionList {...listProps} />
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
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 14,
  },
  sheetPressable: {
    flex: 1,
  },
  sheetModal: {
    maxHeight: "50%",
    height: "50%",
  },
  /** Sit a few px below the properties card top so the stack is visible. */
  sheetEmbedded: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: 10,
    height: undefined,
    maxHeight: undefined,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  closeLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.foreground,
  },
  previewRow: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  previewLabel: {
    flex: 1,
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  previewHint: {
    color: colors.muted,
    fontSize: 12,
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: 8,
  },
  empty: {
    paddingHorizontal: 12,
    paddingVertical: 20,
    color: colors.muted,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
  },
  rowSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  rowPressed: {
    backgroundColor: colors.rowPressed,
  },
  icon: {
    width: 20,
    alignItems: "center",
  },
  label: {
    flex: 1,
    color: colors.foreground,
    fontSize: 16,
  },
  labelSelected: {
    fontWeight: "600",
  },
});
