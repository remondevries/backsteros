import "@azure/core-asynciterator-polyfill";
import "react-native-gesture-handler";

import { ThemeProvider } from "expo-router/react-navigation";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

import { AppErrorBoundary } from "../components/app-error-boundary";
import { AgentMailProvider } from "../lib/agentmail-context";
import { MobileCoreApiUrlProvider } from "../lib/api-url-context";
import { PowerSyncProvider } from "../lib/powersync-context";
import { initSentry, wrapRoot } from "../lib/sentry";
import { NavigationShortcutGateProvider } from "../lib/navigation-shortcut-gate";
import { TabBarVisibilityProvider, TabBarDetailRouteHider } from "../lib/tab-bar-visibility";
import { TrackedTimerProvider } from "../lib/tracked-timer/tracked-timer-context";
import { tabDetailScreenOptions, iosStackGestureOptions } from "../lib/tab-stack-options";
import { colors, navigationTheme } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEscapeBackNavigation } from "../lib/use-escape-back-navigation";

initSentry();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.foreground,
  headerTitleAlign: "left" as const,
  headerTitleStyle: {
    color: colors.foreground,
    fontWeight: "600" as const,
    fontSize: 22,
  },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
  ...iosStackGestureOptions,
};

const rootDetailOptions = tabDetailScreenOptions();

/** Escape → header back (desktop parity; Magic Keyboard / hardware keys). */
function EscapeBackNavigation() {
  useEscapeBackNavigation(true);
  return null;
}

function RootLayout() {
  return (
    <AppErrorBoundary>
      <View style={ui.screen}>
        <ThemeProvider value={navigationTheme}>
          <MobileCoreApiUrlProvider>
            <PowerSyncProvider>
              <AgentMailProvider>
                <TrackedTimerProvider>
                  <TabBarVisibilityProvider>
                    <TabBarDetailRouteHider />
                    <NavigationShortcutGateProvider>
                      <EscapeBackNavigation />
                      <Stack screenOptions={stackScreenOptions}>
                        <Stack.Screen name="index" options={{ title: "BacksterOS" }} />
                        <Stack.Screen name="(app)" options={{ headerShown: false }} />
                        <Stack.Screen
                          name="settings"
                          options={{
                            title: "Settings",
                            headerBackButtonDisplayMode: "minimal",
                            ...iosStackGestureOptions,
                          }}
                        />
                        <Stack.Screen name="task/[id]" options={rootDetailOptions} />
                        <Stack.Screen
                          name="project/[id]/index"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen
                          name="project/[id]/commit/[sha]"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen
                          name="project/[id]/file"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen
                          name="project/[id]/pull/[number]"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen
                          name="contact/[id]"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen
                          name="organization/[id]"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen
                          name="document/[id]"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen name="letter/[id]" options={rootDetailOptions} />
                        <Stack.Screen name="meeting/[id]" options={rootDetailOptions} />
                        <Stack.Screen name="create/task" options={rootDetailOptions} />
                        <Stack.Screen
                          name="create/document"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen
                          name="create/folder"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen
                          name="create/letter"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen
                          name="create/contact"
                          options={rootDetailOptions}
                        />
                        <Stack.Screen
                          name="create/organization"
                          options={rootDetailOptions}
                        />
                      </Stack>
                      <StatusBar style="light" />
                    </NavigationShortcutGateProvider>
                  </TabBarVisibilityProvider>
                </TrackedTimerProvider>
              </AgentMailProvider>
            </PowerSyncProvider>
          </MobileCoreApiUrlProvider>
        </ThemeProvider>
      </View>
    </AppErrorBoundary>
  );
}

export default wrapRoot(RootLayout);
