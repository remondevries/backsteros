import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useHideTabBar } from "../lib/tab-bar-visibility";
import { colors, spacing } from "../lib/theme";
import { DetailPropertiesCirclePlusIcon } from "./detail-properties-circle-plus-icon";
import { PropertiesSheetCloseProvider } from "./detail-property-editor-rows";

export type DetailPropertyChip = {
  key: string;
  label: string;
  icon?: ReactNode;
};

type Props = {
  modalTitle: string;
  chips: readonly DetailPropertyChip[];
  children: ReactNode;
  /** Fired when the all-properties sheet opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Rendered inside the properties Modal (e.g. embedded PropertyOptionSheets).
   * Nested Modals do not stack reliably on iOS.
   */
  overlay?: ReactNode;
};

/**
 * Circle mobile parity: filled property chips in a wrapping card, plus opens a
 * bottom sheet with the full property editor list. Hides stack header + tab bar
 * while the sheet is open for more vertical space.
 */
export function DetailPropertiesInlineShell({
  modalTitle,
  chips,
  children,
  onOpenChange,
  overlay,
}: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  useHideTabBar(open);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    navigation.setOptions({ headerShown: !open });
    return () => {
      navigation.setOptions({ headerShown: true });
    };
  }, [navigation, open]);

  function openSheet() {
    setOpen(true);
  }

  function closeSheet() {
    setOpen(false);
  }

  return (
    <>
      <View style={styles.cardWrap} accessibilityLabel="Details">
        <Pressable
          onPress={openSheet}
          accessibilityRole="button"
          accessibilityLabel="Show all properties"
          style={({ pressed }) => [
            styles.surface,
            pressed ? styles.surfacePressed : null,
          ]}
        >
          <Pressable
            onPress={openSheet}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Show all properties"
            style={({ pressed }) => [
              styles.addButton,
              pressed ? styles.addButtonPressed : null,
            ]}
          >
            <DetailPropertiesCirclePlusIcon />
          </Pressable>

          <View style={styles.fields}>
            {chips.length === 0 ? (
              <Text style={styles.emptyHint}>Add properties</Text>
            ) : (
              chips.map((chip) => (
                <View key={chip.key} style={styles.chip}>
                  {chip.icon ? (
                    <View style={styles.chipIcon}>{chip.icon}</View>
                  ) : null}
                  <Text style={styles.chipLabel} numberOfLines={1}>
                    {chip.label}
                  </Text>
                </View>
              ))
            )}
          </View>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={closeSheet}
            accessibilityRole="button"
            accessibilityLabel="Close properties"
          />
          <View
            style={[
              styles.sheet,
              {
                paddingTop: Math.max(insets.top, 12),
                paddingBottom: Math.max(insets.bottom, 16),
                height: "50%",
                maxHeight: "50%",
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{modalTitle}</Text>
              <Pressable
                onPress={closeSheet}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Done"
                style={({ pressed }) => [
                  styles.doneButton,
                  pressed ? { opacity: 0.7 } : null,
                ]}
              >
                <Text style={styles.doneLabel}>Done</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.sheetBody}
              keyboardShouldPersistTaps="handled"
              bounces
            >
              <PropertiesSheetCloseProvider closeSheet={closeSheet}>
                {children}
              </PropertiesSheetCloseProvider>
            </ScrollView>
            {overlay}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 10,
    paddingBottom: 4,
  },
  surface: {
    position: "relative",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 12,
    minHeight: 48,
  },
  surfacePressed: {
    backgroundColor: colors.rowPressed,
  },
  addButton: {
    position: "absolute",
    right: 6,
    top: 6,
    zIndex: 1,
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  fields: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    paddingRight: 36,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.faint,
  },
  chipIcon: {
    width: 14,
    alignItems: "center",
  },
  chipLabel: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
    flexShrink: 1,
  },
  emptyHint: {
    color: colors.muted,
    fontSize: 13,
    paddingVertical: 2,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheet: {
    position: "relative",
    width: "100%",
    backgroundColor: "#101010",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  doneButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  doneLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
  sheetBody: {
    flex: 1,
    flexGrow: 1,
  },
});
