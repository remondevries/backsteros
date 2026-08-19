import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/theme";
import { FileTypeIcon } from "../file-type-icon";

function fileTabLabel(path: string): string {
  return path.split("/").pop() || path;
}

type Props = {
  openPaths: string[];
  activePath: string | null;
  dirtyPaths?: string[];
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
};

/** Native port of desktop `FileEditorTabBar`. */
export function FileEditorTabBar({
  openPaths,
  activePath,
  dirtyPaths = [],
  onActivate,
  onClose,
}: Props) {
  if (openPaths.length === 0) return null;

  const dirtySet = new Set(dirtyPaths);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.barContent}
      accessibilityRole="tablist"
      accessibilityLabel="Open files"
    >
      {openPaths.map((path, index) => {
        const active = path === activePath;
        const dirty = dirtySet.has(path);
        const label = fileTabLabel(path);
        const hasTabsToRight = index < openPaths.length - 1;

        return (
          <View
            key={path}
            style={[styles.tabWidth, active ? styles.tabWidthActive : null]}
          >
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              onPress={() => onActivate(path)}
              style={[
                styles.tab,
                active ? styles.tabActive : null,
                hasTabsToRight ? styles.tabBorderRight : null,
              ]}
            >
              {active ? <View style={styles.activeBar} /> : null}
              <FileTypeIcon pathValue={path} size={12} />
              <Text
                style={[styles.label, active ? styles.labelActive : null]}
                numberOfLines={1}
              >
                {label}
              </Text>
              <View style={styles.trailing}>
                {dirty ? (
                  <View
                    style={styles.dirty}
                    accessibilityLabel="Unsaved changes"
                  />
                ) : null}
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation?.();
                    onClose(path);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Close ${label}`}
                  style={({ pressed }) => [
                    styles.close,
                    // Desktop: dirty tabs show the green dot; close appears on demand.
                    // Keep close tappable but de-emphasize when dirty so the dot reads clearly.
                    dirty && !active ? styles.closeHidden : null,
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                >
                  <Text style={styles.closeLabel}>×</Text>
                </Pressable>
              </View>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  barContent: {
    alignItems: "stretch",
    minHeight: 36,
  },
  tabWidth: {
    maxWidth: 200,
  },
  tabWidthActive: {
    maxWidth: 240,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: "relative",
  },
  tabActive: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  tabBorderRight: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  activeBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
  label: {
    flexShrink: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    maxWidth: 140,
  },
  labelActive: {
    color: colors.foreground,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 2,
  },
  dirty: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3fb950",
  },
  close: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  closeHidden: {
    opacity: 0,
  },
  closeLabel: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "500",
  },
});
