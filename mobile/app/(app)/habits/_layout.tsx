import { Stack } from "expo-router";

import { iosStackGestureOptions } from "../../../lib/tab-stack-options";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { HabitsDetailHost } from "../../../components/habits/habits-detail-host";
import { HabitsHeader } from "../../../components/habits/habits-header";
import { HabitsSidePanel } from "../../../components/habits/habits-side-panel";
import { isPadDevice } from "../../../lib/device";
import {
  HabitsDataProvider,
  useHabitsData,
} from "../../../lib/habits/use-habits-data";
import {
  PadContentCanvas,
  PadSidePanelFrame,
  PadSidePanelCollapsedRail,
  usePadSidePanelCollapsed,
} from "../../../lib/pad-side-panel-collapse";
import { colors } from "../../../lib/theme";

const LIST_PANE_WIDTH = 256;

function HabitsListPane({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
}) {
  const data = useHabitsData();
  const [adding, setAdding] = useState(false);
  return (
    <View style={styles.listPaneInner}>
      <HabitsHeader
        includeSafeArea={false}
        backgroundColor={colors.surface}
        onAdd={() => {
          setAdding(true);
        }}
        onToggleCollapse={onToggleCollapse}
      />
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
        autoSelectFirst
        adding={adding}
        onAddingChange={setAdding}
      />
    </View>
  );
}

function HabitsPhoneStack() {
  return (
    <View style={styles.phoneRoot}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          ...iosStackGestureOptions,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "Habit Tracker",
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        {/*
          Chrome lives inside HabitTrackerPane so the push animates as one
          screen — no native header swap after mount.
        */}
        <Stack.Screen
          name="[id]"
          options={{
            title: "",
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            ...iosStackGestureOptions,
          }}
        />
      </Stack>
    </View>
  );
}

function HabitsPadShell() {
  const { collapsed, setCollapsed } = usePadSidePanelCollapsed("habits");

  return (
    <View style={styles.split}>
      {collapsed ? (
        <PadSidePanelCollapsedRail
          onExpand={() => setCollapsed(false)}
          accessibilityLabel="Show Habit Tracker list"
        />
      ) : (
        <PadSidePanelFrame width={LIST_PANE_WIDTH}>
          <HabitsListPane onToggleCollapse={() => setCollapsed(true)} />
        </PadSidePanelFrame>
      )}
      {/*
        Canvas column (not PadContentFrame): habit tracker floats on the black
        shell like task overview — only the left list is carded.
      */}
      <PadContentCanvas>
        <View style={styles.detailHost}>
          <HabitsDetailHost />
        </View>
        <View style={styles.routeStack} pointerEvents="none">
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "none",
              contentStyle: { backgroundColor: "transparent" },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="[id]" />
          </Stack>
        </View>
      </PadContentCanvas>
    </View>
  );
}

export default function HabitsLayout() {
  return (
    <HabitsDataProvider>
      {isPadDevice() ? <HabitsPadShell /> : <HabitsPhoneStack />}
    </HabitsDataProvider>
  );
}

const styles = StyleSheet.create({
  phoneRoot: {
    flex: 1,
    position: "relative",
  },
  split: {
    flex: 1,
    flexDirection: "row",
    position: "relative",
    backgroundColor: colors.background,
  },
  listPaneInner: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.surface,
  },
  detailHost: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  routeStack: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
});
