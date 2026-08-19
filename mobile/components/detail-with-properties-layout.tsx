import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

export const DETAIL_PROPERTIES_PANEL_WIDTH = 300;

type Props = {
  main: ReactNode;
  properties: ReactNode;
  /** Accessibility label for the rail (default: Properties). */
  propertiesTitle?: string;
};

/**
 * Desktop-style detail split: scrollable main column + fixed right properties
 * rail. Pass stacked `EntityPropertiesSection` cards as `properties`.
 */
export function DetailWithPropertiesLayout({
  main,
  properties,
  propertiesTitle = "Properties",
}: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.main}>{main}</View>
      <View style={styles.panel} accessibilityLabel={propertiesTitle}>
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={styles.panelScrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.stack}>{properties}</View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    backgroundColor: "transparent",
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  panel: {
    width: DETAIL_PROPERTIES_PANEL_WIDTH,
    flexShrink: 0,
    backgroundColor: "transparent",
  },
  panelScroll: {
    flex: 1,
  },
  panelScrollContent: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 48,
  },
  /** Desktop `.entity-properties-stack`. */
  stack: {
    gap: 8,
  },
});
