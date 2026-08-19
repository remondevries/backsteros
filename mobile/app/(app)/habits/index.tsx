import { useNavigation } from "@react-navigation/native";
import { useLayoutEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { HabitsHeader } from "../../../components/habits/habits-header";
import { HabitsSidePanel } from "../../../components/habits/habits-side-panel";
import { isPadDevice } from "../../../lib/device";
import { useHabitsData } from "../../../lib/habits/use-habits-data";
import { colors } from "../../../lib/theme";

/**
 * Phone: habit list with Inbox-style header +. iPad: URL stub — detail is HabitsDetailHost.
 */
export default function HabitsIndexScreen() {
  const data = useHabitsData();
  const isPad = isPadDevice();
  const navigation = useNavigation();
  const [adding, setAdding] = useState(false);

  useLayoutEffect(() => {
    if (isPad) return;
    navigation.setOptions({
      header: () => (
        <HabitsHeader
          onAdd={() => {
            setAdding(true);
          }}
        />
      ),
    });
  }, [isPad, navigation]);

  if (isPad) {
    return <View style={styles.padRouteStub} />;
  }

  return (
    <View style={styles.phone}>
      <HabitsSidePanel
        items={data.items}
        loading={data.loading}
        error={data.error}
        pullRefreshing={data.pullRefreshing}
        onRefresh={() => {
          void data.reload();
        }}
        onCreateHabit={data.onCreateHabit}
        onToggleToday={(habit, checked) => {
          void data.onToggleToday(habit, checked);
        }}
        adding={adding}
        onAddingChange={setAdding}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  phone: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padRouteStub: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
