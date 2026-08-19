import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import {
  ContactsHeader,
} from "../../../components/contacts-header";
import { ContactsListPane } from "../../../components/contacts-list-pane";
import { isPadDevice } from "../../../lib/device";
import {
  PadContentFrame,
  PadSidePanelCollapsedRail,
  usePadSidePanelCollapsed,
} from "../../../lib/pad-side-panel-collapse";
import { tabDetailScreenOptions } from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

const LIST_PANE_WIDTH = 320;

function padDetailOptions() {
  return {
    ...tabDetailScreenOptions({ embedded: true }),
    headerBackVisible: false,
  };
}

export default function ContactsLayout() {
  const { collapsed, setCollapsed } = usePadSidePanelCollapsed("contacts");

  if (!isPadDevice()) {
    return (
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
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
          accessibilityLabel="Show Contacts list"
        />
      ) : (
        <View style={styles.listPane}>
          <ContactsHeader onToggleCollapse={() => setCollapsed(true)} />
          <View style={styles.listBody}>
            <ContactsListPane autoSelectFirst />
          </View>
        </View>
      )}
      <PadContentFrame>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.surface },
            headerStyle: { backgroundColor: colors.surface },
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
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
