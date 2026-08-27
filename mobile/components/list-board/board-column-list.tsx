import { useMemo } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { spacing } from "../../lib/theme";
import { BoardColumn, type BoardCardRow } from "./board-column";

export type BoardColumnGroup = {
  key: string;
  title: string;
  status: string;
  rows: readonly BoardCardRow[];
};

type Props = {
  columns: readonly BoardColumnGroup[];
  onPressRow: (row: BoardCardRow) => void;
  onPressStatus: (row: BoardCardRow) => void;
};

export function BoardColumnList({ columns, onPressRow, onPressStatus }: Props) {
  const { width } = useWindowDimensions();
  const columnWidth = useMemo(() => Math.max(240, width * 0.72), [width]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {columns.map((column) => (
        <View key={column.key} style={styles.columnWrap}>
          <BoardColumn
            title={column.title}
            status={column.status}
            rows={column.rows}
            onPressRow={onPressRow}
            onPressStatus={onPressStatus}
            width={columnWidth}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.screenX,
    paddingBottom: spacing.screenX,
    gap: 12,
  },
  columnWrap: {
    height: "100%",
    minHeight: 320,
  },
});
