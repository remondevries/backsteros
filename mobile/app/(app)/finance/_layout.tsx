import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import { FinanceSideNav } from "../../../components/finance/finance-side-nav";
import { isPadDevice } from "../../../lib/device";
import {
  PadContentFrame,
  PadSidePanelCollapsedRail,
  usePadSidePanelCollapsed,
} from "../../../lib/pad-side-panel-collapse";
import { tabDetailScreenOptions } from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";

const NAV_PANE_WIDTH = 224;

function FinanceStack({ ipad }: { ipad: boolean }) {
  const detail = {
    ...tabDetailScreenOptions({ embedded: ipad }),
    ...(ipad
      ? {
          headerBackVisible: false,
          headerLeft: () => null,
          headerTitleAlign: "left" as const,
        }
      : null),
  };
  const contentBg = ipad ? colors.surface : colors.background;
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: contentBg },
        headerStyle: { backgroundColor: contentBg },
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        // Keep prior screens painted under transparentModal transaction overlays.
        ...(ipad ? { detachInactiveScreens: false } : null),
        ...(ipad
          ? {
              headerBackVisible: false,
              headerLeft: () => null,
              headerTitleAlign: "left" as const,
            }
          : null),
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: ipad ? "" : "Finance",
          contentStyle: { backgroundColor: contentBg },
          headerStyle: { backgroundColor: contentBg },
          ...(ipad
            ? {
                headerShown: false,
                headerBackVisible: false,
                headerLeft: () => null,
                headerTitle: () => null,
              }
            : null),
        }}
      />
      <Stack.Screen name="transactions" options={detail} />
      <Stack.Screen
        name="transaction/[id]"
        options={
          ipad
            ? {
                // Keep the list (or account) screen mounted + visible under the
                // full-window slide-over Modal.
                presentation: "transparentModal",
                animation: "none",
                headerShown: false,
                contentStyle: { backgroundColor: "transparent" },
                gestureEnabled: false,
              }
            : detail
        }
      />
      <Stack.Screen name="ledger/[id]" options={detail} />
      <Stack.Screen name="invoices" options={detail} />
      <Stack.Screen
        name="invoice/[id]"
        options={
          ipad
            ? {
                presentation: "transparentModal",
                animation: "none",
                headerShown: false,
                contentStyle: { backgroundColor: "transparent" },
                gestureEnabled: false,
              }
            : detail
        }
      />
      <Stack.Screen name="goals" options={detail} />
      <Stack.Screen name="goal/[id]" options={detail} />
      <Stack.Screen name="goal-form" options={detail} />
      <Stack.Screen name="cashflow" options={detail} />
      <Stack.Screen name="accounts" options={detail} />
      <Stack.Screen name="account/[id]" options={detail} />
      <Stack.Screen name="account-form" options={detail} />
      <Stack.Screen name="investments" options={detail} />
      <Stack.Screen name="categories" options={detail} />
      <Stack.Screen name="category/[id]" options={detail} />
      <Stack.Screen name="category-form" options={detail} />
      <Stack.Screen name="recurrings" options={detail} />
      <Stack.Screen name="recurring/[id]" options={detail} />
      <Stack.Screen name="recurring-form" options={detail} />
    </Stack>
  );
}

export default function FinanceLayout() {
  const { collapsed, setCollapsed } = usePadSidePanelCollapsed("finance");

  if (!isPadDevice()) {
    return <FinanceStack ipad={false} />;
  }

  return (
    <View style={styles.split}>
      {collapsed ? (
        <PadSidePanelCollapsedRail
          onExpand={() => setCollapsed(false)}
          accessibilityLabel="Show Finance navigation"
        />
      ) : (
        <View style={styles.navPane}>
          <FinanceSideNav onToggleCollapse={() => setCollapsed(true)} />
        </View>
      )}
      <PadContentFrame>
        <FinanceStack ipad />
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
  navPane: {
    width: NAV_PANE_WIDTH,
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: colors.background,
  },
});
