import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import {
  getTasksDueFilterLabel,
  TASKS_DUE_FILTERS,
  type TasksDueFilter,
} from "../lib/tasks-due-filters";
import { colors, spacing } from "../lib/theme";
import { PillNav } from "./pill-nav";

type Props = {
  dueFilter: TasksDueFilter;
  onDueFilterChange: (filter: TasksDueFilter) => void;
};

export function TasksHeader({ dueFilter, onDueFilterChange }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{
          paddingHorizontal: spacing.screenX,
          paddingBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            color: colors.foreground,
            fontWeight: "600",
            fontSize: 22,
          }}
        >
          Tasks
        </Text>
        <TabStackHeaderPlusButton
          onPress={() =>
            router.push({
              pathname: "/(app)/tasks/new",
              params: { dueFilter },
            })
          }
          accessibilityLabel="Create task"
        />
      </View>
      <PillNav
        accessibilityLabel="Due date filter"
        value={dueFilter}
        onChange={onDueFilterChange}
        items={TASKS_DUE_FILTERS.map((value) => ({
          value,
          label: getTasksDueFilterLabel(value),
        }))}
      />
    </View>
  );
}
