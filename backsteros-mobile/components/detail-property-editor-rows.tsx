import { useRouter, type Href } from "expo-router";
import { createContext, useContext, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { ChevronRightIcon } from "./chevron-right-icon";

export type EditablePropertyRow = {
  key: string;
  label: string;
  value: string;
  icon?: ReactNode;
  /** When false with `onPressRow`, row stays display-only (e.g. progress). */
  editable?: boolean;
  /**
   * When set, shows a chevron to open this related entity (project, etc.),
   * matching desktop `PropertyDropdownNavigateRow`.
   */
  navigateHref?: string | null;
  navigateLabel?: string;
};

type Props = {
  rows: readonly EditablePropertyRow[];
  onPressRow?: (key: string) => void;
};

type SheetCloseContextValue = {
  closeSheet: () => void;
};

const PropertiesSheetCloseContext =
  createContext<SheetCloseContextValue | null>(null);

/** Lets property rows close the all-properties sheet before navigating. */
export function PropertiesSheetCloseProvider({
  closeSheet,
  children,
}: {
  closeSheet: () => void;
  children: ReactNode;
}) {
  return (
    <PropertiesSheetCloseContext.Provider value={{ closeSheet }}>
      {children}
    </PropertiesSheetCloseContext.Provider>
  );
}

/** Property label/value rows used inside the all-properties bottom sheet. */
export function DetailPropertyEditorRows({ rows, onPressRow }: Props) {
  const router = useRouter();
  const sheet = useContext(PropertiesSheetCloseContext);

  function openRelated(href: string) {
    sheet?.closeSheet();
    router.push(href as Href);
  }

  return (
    <>
      {rows.map((property) => {
        const navigateHref = property.navigateHref?.trim() || null;
        const canNavigate = Boolean(navigateHref);
        const interactive = Boolean(onPressRow) && property.editable !== false;

        const value = (
          <View style={ui.propertyValue}>
            {property.icon}
            <Text style={ui.propertyValueText} numberOfLines={1}>
              {property.value}
            </Text>
          </View>
        );

        return (
          <View key={property.key} style={styles.row}>
            {interactive ? (
              <Pressable
                onPress={() => onPressRow?.(property.key)}
                style={({ pressed }) => [
                  styles.rowMain,
                  pressed ? { backgroundColor: colors.rowPressed } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${property.label}`}
              >
                <Text style={ui.propertyLabel}>{property.label}</Text>
                {value}
              </Pressable>
            ) : (
              <View style={styles.rowMain}>
                <Text style={ui.propertyLabel}>{property.label}</Text>
                {value}
              </View>
            )}
            {canNavigate ? (
              <Pressable
                onPress={() => openRelated(navigateHref!)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  property.navigateLabel ?? `Open ${property.label}`
                }
                style={({ pressed }) => [
                  styles.navigateHit,
                  pressed ? { opacity: 0.55 } : null,
                ]}
              >
                <ChevronRightIcon size={14} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingLeft: 16,
    paddingVertical: 12,
    paddingRight: 4,
  },
  navigateHit: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
});
