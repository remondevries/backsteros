import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  isEmojiProjectIconDisplay,
  parseDisplayEntityIcon,
} from "../lib/project-display-icon";
import {
  filterEntityIconEmojis,
  filterEntityIconKeys,
  formatEntityIconKeyLabel,
  listRenderableEntityIconKeys,
} from "../lib/entity-icon-picker";
import { useHideTabBar } from "../lib/tab-bar-visibility";
import { colors } from "../lib/theme";
import { ProjectOcticon } from "./project-octicon";

type Tab = "icons" | "emojis";

export type EntityIconPickerSheetProps = {
  visible: boolean;
  value: string | null | undefined;
  title?: string;
  onClose: () => void;
  onSelect: (icon: string | null) => void;
  /** Preview for the “default” (clear) option. */
  defaultLabel?: string;
};

/**
 * Bottom sheet to pick an octicon key, emoji, or clear to the default glyph.
 */
export function EntityIconPickerSheet({
  visible,
  value,
  title = "Choose icon",
  onClose,
  onSelect,
  defaultLabel = "Default icon",
}: EntityIconPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("icons");
  const [query, setQuery] = useState("");
  const allKeys = useMemo(() => listRenderableEntityIconKeys(), []);

  useHideTabBar(visible);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      return;
    }
    const display = parseDisplayEntityIcon(value).display;
    setTab(
      display && isEmojiProjectIconDisplay(display) ? "emojis" : "icons",
    );
  }, [value, visible]);

  const iconKeys = useMemo(
    () => filterEntityIconKeys(query, allKeys),
    [allKeys, query],
  );
  const emojis = useMemo(() => filterEntityIconEmojis(query), [query]);

  const selected = value?.trim() || null;

  const pick = useCallback(
    (next: string | null) => {
      onSelect(next);
      onClose();
    },
    [onClose, onSelect],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: Math.max(16, insets.bottom + 10) },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.headerAction}>Cancel</Text>
            </Pressable>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.tabs}>
            <Pressable
              onPress={() => setTab("icons")}
              style={[styles.tab, tab === "icons" ? styles.tabActive : null]}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === "icons" }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  tab === "icons" ? styles.tabLabelActive : null,
                ]}
              >
                Icons
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab("emojis")}
              style={[styles.tab, tab === "emojis" ? styles.tabActive : null]}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === "emojis" }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  tab === "emojis" ? styles.tabLabelActive : null,
                ]}
              >
                Emojis
              </Text>
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={
              tab === "icons" ? "Search icons…" : "Search emojis…"
            }
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            style={styles.search}
          />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
          >
            {tab === "icons" ? (
              <>
                <Pressable
                  onPress={() => pick(null)}
                  style={[
                    styles.cell,
                    selected == null ? styles.cellSelected : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={defaultLabel}
                  accessibilityState={{ selected: selected == null }}
                >
                  <ProjectOcticon icon={null} size={18} color={colors.muted} />
                </Pressable>
                {iconKeys.map((key) => {
                  const isSelected = selected === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => pick(key)}
                      style={[
                        styles.cell,
                        isSelected ? styles.cellSelected : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={formatEntityIconKeyLabel(key)}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <ProjectOcticon
                        icon={key}
                        size={18}
                        color={colors.foreground}
                      />
                    </Pressable>
                  );
                })}
                {iconKeys.length === 0 ? (
                  <Text style={styles.empty}>No icons match your search.</Text>
                ) : null}
              </>
            ) : (
              <>
                {emojis.map((entry) => {
                  const isSelected = selected === entry.emoji;
                  return (
                    <Pressable
                      key={entry.emoji}
                      onPress={() => pick(entry.emoji)}
                      style={[
                        styles.cell,
                        styles.emojiCell,
                        isSelected ? styles.cellSelected : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={entry.keywords[0] ?? entry.emoji}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text style={styles.emoji}>{entry.emoji}</Text>
                    </Pressable>
                  );
                })}
                {emojis.length === 0 ? (
                  <Text style={styles.empty}>No emojis match your search.</Text>
                ) : null}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  headerAction: {
    color: colors.muted,
    fontSize: 15,
    minWidth: 64,
  },
  headerSpacer: {
    minWidth: 64,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: colors.foreground,
  },
  search: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.foreground,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  scroll: {
    flexGrow: 0,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  cell: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  emojiCell: {
    paddingTop: 2,
  },
  cellSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(238,122,71,0.16)",
  },
  emoji: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: "center",
  },
  empty: {
    width: "100%",
    textAlign: "center",
    color: colors.muted,
    fontSize: 13,
    paddingVertical: 24,
  },
});
