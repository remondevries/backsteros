import { FlashList } from "@shopify/flash-list";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "../../lib/theme";
import { TaskStatusIcon } from "../task-status-icon";

export type BoardCardRow = {
  id: string;
  title: string | null;
  status: string | null;
  display_id?: string | null;
  subtitle?: string | null;
};

type Props = {
  title: string;
  status: string;
  rows: readonly BoardCardRow[];
  onPressRow: (row: BoardCardRow) => void;
  onPressStatus: (row: BoardCardRow) => void;
  width: number;
};

export function BoardColumn({
  title,
  status,
  rows,
  onPressRow,
  onPressStatus,
  width,
}: Props) {
  return (
    <View style={[styles.column, { width }]}>
      <View style={styles.header}>
        <TaskStatusIcon status={status} size={14} />
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.count}>{rows.length}</Text>
      </View>
      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => onPressRow(item)}
            onLongPress={() => onPressStatus(item)}
            style={({ pressed }) => [
              styles.card,
              pressed ? styles.cardPressed : null,
            ]}
          >
            {item.display_id ? (
              <Text style={styles.displayId}>{item.display_id}</Text>
            ) : null}
            <Text style={styles.cardTitle} numberOfLines={3}>
              {item.title?.trim() || "Untitled"}
            </Text>
            {item.subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change status"
              onPress={() => onPressStatus(item)}
              style={styles.statusChip}
            >
              <TaskStatusIcon status={item.status} size={12} />
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    flex: 1,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  count: {
    color: colors.muted,
    fontSize: 12,
  },
  card: {
    marginHorizontal: 8,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
  },
  cardPressed: {
    opacity: 0.75,
  },
  displayId: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
  },
  cardTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
  },
  statusChip: {
    alignSelf: "flex-start",
    marginTop: 4,
    padding: 4,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
});
