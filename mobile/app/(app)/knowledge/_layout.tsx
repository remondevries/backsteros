import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import { DocumentsListPanel } from "../../../components/documents-list-panel";
import { KnowledgeHeader } from "../../../components/knowledge-header";
import { isPadDevice } from "../../../lib/device";
import {
  PadContentFrame,
  PadSidePanelCollapsedRail,
  usePadSidePanelCollapsed,
} from "../../../lib/pad-side-panel-collapse";
import {tabDetailScreenOptions, iosStackGestureOptions} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

const LIST_PANE_WIDTH = 320;

function padDetailOptions() {
  return {
    ...tabDetailScreenOptions({ embedded: true }),
    headerBackVisible: false,
  };
}

export default function KnowledgeLayout() {
  const { collapsed, setCollapsed } = usePadSidePanelCollapsed("knowledge");

  if (!isPadDevice()) {
    return (
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          ...iosStackGestureOptions,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen name="[id]" options={tabDetailScreenOptions()} />
      </Stack>
    );
  }

  return (
    <View style={styles.split}>
      {collapsed ? (
        <PadSidePanelCollapsedRail
          onExpand={() => setCollapsed(false)}
          accessibilityLabel="Show Knowledge list"
        />
      ) : (
        <View style={styles.listPane}>
          <KnowledgeHeader onToggleCollapse={() => setCollapsed(true)} />
          <View style={styles.listBody}>
            <DocumentsListPanel
              documentType="knowledge"
              includeFolders
              showListSearch
              emptyMessage="No knowledge documents yet."
              autoSelectFirst
              sectionRoute="knowledge"
            />
          </View>
        </View>
      )}
      <PadContentFrame>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.surface },
            headerStyle: { backgroundColor: colors.surface },
            ...iosStackGestureOptions,
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.surface },
            }}
          />
          <Stack.Screen
            name="[id]"
            options={{
              ...padDetailOptions(),
              animation: "fade",
              animationDuration: 220,
            }}
          />
        </Stack>
      </PadContentFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  split: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    backgroundColor: colors.background,
  },
  listPane: {
    width: LIST_PANE_WIDTH,
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  listBody: {
    flex: 1,
    minHeight: 0,
  },
});
