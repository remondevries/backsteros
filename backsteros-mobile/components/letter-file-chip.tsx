import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutRectangle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  stripPdfExtension,
  withPdfExtension,
} from "../lib/letter-pdf-filename";
import { useHideTabBar } from "../lib/tab-bar-visibility";
import { colors } from "../lib/theme";
import { LetterIcon } from "./letter-icon";
import { MoreHorizontalIcon } from "./more-horizontal-icon";

export type LetterFileRenameResult =
  | { ok: true }
  | { ok: false; error: string };

export type LetterFileDeleteResult =
  | { ok: true }
  | { ok: false; error: string };

type Props = {
  /** Full filename (usually `*.pdf`); displayed without the extension. */
  filename: string;
  onPress?: () => void;
  /** Clear a pending local pick (create-letter). */
  onRemove?: () => void;
  /** When set, menu includes Rename (opens a rename modal). */
  onRename?: (
    nextFilename: string,
  ) => Promise<LetterFileRenameResult> | LetterFileRenameResult;
  /** When set, menu includes Delete. */
  onDelete?: () => Promise<LetterFileDeleteResult> | LetterFileDeleteResult;
  disabled?: boolean;
  active?: boolean;
};

/** PDF tab label — letter icon + name, with ⋯ menu for Rename / Delete. */
export function LetterFileChip({
  filename,
  onPress,
  onRemove,
  onRename,
  onDelete,
  disabled = false,
  active = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const moreRef = useRef<View>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<LayoutRectangle | null>(null);
  const [draft, setDraft] = useState(stripPdfExtension(filename));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = stripPdfExtension(filename);
  const busy = saving || deleting || disabled;
  const showMenu = Boolean(onRename || onDelete || onRemove);

  useHideTabBar(renameOpen);

  useEffect(() => {
    if (!renameOpen) {
      setDraft(stripPdfExtension(filename));
    }
  }, [filename, renameOpen]);

  useEffect(() => {
    if (!renameOpen) return;
    const id = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const length = stripPdfExtension(filename).length;
      input.setSelection(0, length);
    });
    return () => cancelAnimationFrame(id);
  }, [filename, renameOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    moreRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
    });
  }, [menuOpen]);

  function closeRename() {
    if (saving) return;
    setRenameOpen(false);
    setError(null);
    setDraft(stripPdfExtension(filename));
  }

  async function commitRename() {
    if (!onRename || saving) return;
    const nextFilename = withPdfExtension(draft);
    const currentFilename = withPdfExtension(filename || "Document");
    if (nextFilename === currentFilename) {
      setRenameOpen(false);
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await onRename(nextFilename);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRenameOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function commitDelete() {
    if (deleting) return;
    if (onRemove && !onDelete) {
      onRemove();
      return;
    }
    if (!onDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await onDelete();
      if (!result.ok) {
        setError(result.error);
      }
    } finally {
      setDeleting(false);
    }
  }

  const windowHeight = Dimensions.get("window").height;
  const menuTop = menuAnchor
    ? Math.max(12, menuAnchor.y - 8 - 96)
    : 0;
  const menuRight = menuAnchor
    ? Math.max(
        12,
        Dimensions.get("window").width - (menuAnchor.x + menuAnchor.width),
      )
    : 12;

  return (
    <>
      <View style={[styles.chip, active ? styles.chipActive : null]}>
        <BlurView
          intensity={48}
          tint="dark"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          pointerEvents="none"
          style={[styles.chipFill, active ? styles.chipFillActive : null]}
        />
        <View
          pointerEvents="none"
          style={[styles.chipBorder, active ? styles.chipBorderActive : null]}
        />
        <Pressable
          onPress={onPress}
          disabled={busy || !onPress}
          accessibilityRole={onPress ? "button" : undefined}
          accessibilityLabel={onPress ? `Open ${label}` : label}
          accessibilityState={{ selected: active }}
          style={({ pressed }) => [
            styles.chipHit,
            pressed && onPress ? { opacity: 0.55 } : null,
          ]}
        >
          <LetterIcon size={14} color={colors.foreground} />
          <Text style={styles.chipLabel} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
        {showMenu ? (
          <View ref={moreRef} collapsable={false}>
            <Pressable
              onPress={() => setMenuOpen(true)}
              hitSlop={10}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${label}`}
              style={({ pressed }) => [
                styles.moreHit,
                pressed ? { opacity: 0.55 } : null,
              ]}
            >
              {deleting ? (
                <ActivityIndicator color={colors.muted} size="small" />
              ) : (
                <MoreHorizontalIcon size={16} color={colors.foreground} />
              )}
            </Pressable>
          </View>
        ) : null}
      </View>

      {error && !renameOpen ? (
        <Text style={styles.inlineError} numberOfLines={1}>
          {error}
        </Text>
      ) : null}

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.scrim}
          onPress={() => setMenuOpen(false)}
          accessibilityLabel="Dismiss menu"
        >
          {menuAnchor ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.menuHost,
                {
                  top: menuTop,
                  right: menuRight,
                  maxHeight: windowHeight - menuTop - 24,
                },
              ]}
            >
              <Pressable onPress={(event) => event.stopPropagation()}>
                <View style={styles.menuShell}>
                  <BlurView
                    intensity={55}
                    tint="systemChromeMaterialDark"
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.menuFill} />
                  <View style={styles.menuBorder} />
                  <View style={styles.menuList}>
                    {onRename ? (
                      <Pressable
                        accessibilityRole="menuitem"
                        accessibilityLabel="Rename"
                        onPress={() => {
                          setMenuOpen(false);
                          setDraft(stripPdfExtension(filename));
                          setError(null);
                          setRenameOpen(true);
                        }}
                        style={({ pressed }) => [
                          styles.menuItem,
                          pressed ? styles.menuItemPressed : null,
                        ]}
                      >
                        <Text style={styles.menuLabel}>Rename</Text>
                      </Pressable>
                    ) : null}
                    {onDelete || onRemove ? (
                      <Pressable
                        accessibilityRole="menuitem"
                        accessibilityLabel="Delete"
                        onPress={() => {
                          setMenuOpen(false);
                          void commitDelete();
                        }}
                        style={({ pressed }) => [
                          styles.menuItem,
                          pressed ? styles.menuItemPressed : null,
                        ]}
                      >
                        <Text style={[styles.menuLabel, styles.menuLabelDanger]}>
                          Delete
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Modal>

      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={closeRename}
      >
        <KeyboardAvoidingView
          style={styles.renameRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={styles.renameBackdrop}
            onPress={closeRename}
            accessibilityRole="button"
            accessibilityLabel="Cancel rename"
          />
          <View
            style={[
              styles.renameCard,
              { marginBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <Text style={styles.renameTitle}>Rename PDF</Text>
            <View style={styles.renameField}>
              <LetterIcon size={16} color={colors.muted} />
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                editable={!saving}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => {
                  void commitRename();
                }}
                placeholder="Document"
                placeholderTextColor={colors.muted}
                style={styles.renameFieldInput}
                accessibilityLabel="PDF name"
              />
              <Text style={styles.renameExtension}>.pdf</Text>
            </View>
            {error ? <Text style={styles.renameError}>{error}</Text> : null}
            <View style={styles.renameActions}>
              <Pressable
                onPress={closeRename}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={({ pressed }) => [
                  styles.renameButton,
                  pressed ? { opacity: 0.7 } : null,
                ]}
              >
                <Text style={styles.renameCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void commitRename();
                }}
                disabled={saving || !draft.trim()}
                accessibilityRole="button"
                accessibilityLabel="Save"
                style={({ pressed }) => [
                  styles.renameButton,
                  styles.renameSaveButton,
                  pressed || saving || !draft.trim()
                    ? { opacity: 0.55 }
                    : null,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.buttonText} size="small" />
                ) : (
                  <Text style={styles.renameSaveLabel}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    maxWidth: 260,
    borderRadius: 10,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  chipActive: {
    shadowOpacity: 0.4,
  },
  chipFill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: "rgba(20, 20, 22, 0.4)",
  },
  chipFillActive: {
    backgroundColor: "rgba(40, 40, 44, 0.72)",
  },
  chipBorder: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  chipBorderActive: {
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  chipHit: {
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 10,
    paddingRight: 2,
    paddingVertical: 6,
    maxWidth: 170,
    flexShrink: 1,
  },
  chipLabel: {
    flexShrink: 1,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
  },
  moreHit: {
    zIndex: 2,
    width: 32,
    height: 36,
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  inlineError: {
    color: colors.danger,
    fontSize: 10,
    marginTop: 2,
    maxWidth: 200,
  },
  scrim: {
    flex: 1,
  },
  menuHost: {
    position: "absolute",
    minWidth: 160,
  },
  menuShell: {
    borderRadius: 14,
    overflow: "hidden",
    minWidth: 160,
  },
  menuFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(28, 28, 30, 0.55)",
  },
  menuBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  menuList: {
    padding: 6,
    gap: 2,
  },
  menuItem: {
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    justifyContent: "center",
  },
  menuItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  menuLabel: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  menuLabelDanger: {
    color: colors.danger,
  },
  renameRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  renameBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  renameCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: "#101010",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 14,
  },
  renameTitle: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  renameField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  renameFieldInput: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 12,
  },
  renameExtension: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  renameError: {
    color: colors.danger,
    fontSize: 13,
    marginTop: -6,
  },
  renameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  renameButton: {
    minHeight: 40,
    minWidth: 84,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  renameSaveButton: {
    backgroundColor: colors.buttonBg,
  },
  renameCancelLabel: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  renameSaveLabel: {
    color: colors.buttonText,
    fontSize: 15,
    fontWeight: "600",
  },
});
