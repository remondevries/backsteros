import { Pressable, Text } from "react-native";

import type { ListBoardView } from "../lib/list-board-view";
import { colors } from "../lib/theme";

type Props = {
  view: ListBoardView;
  onToggle: () => void;
};

export function ListBoardToggle({ view, onToggle }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={view === "board" ? "Show list view" : "Show board view"}
      onPress={onToggle}
      hitSlop={8}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>
        {view === "board" ? "List" : "Board"}
      </Text>
    </Pressable>
  );
}
