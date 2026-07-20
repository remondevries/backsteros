import "@azure/core-asynciterator-polyfill";
import "react-native-gesture-handler";

import { ClerkProvider, ClerkLoaded } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";

import { AppErrorBoundary } from "../components/app-error-boundary";
import { getMobileEnvironment } from "../lib/env";
import { PowerSyncProvider } from "../lib/powersync-context";
import { initSentry, wrapRoot } from "../lib/sentry";
import { TabBarVisibilityProvider } from "../lib/tab-bar-visibility";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors, navigationTheme } from "../lib/theme";
import { ui } from "../lib/ui";

initSentry();

const publishableKey = getMobileEnvironment().clerkPublishableKey;

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
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
};

const rootDetailOptions = tabDetailScreenOptions();

function RootLayout() {
  if (!publishableKey) {
    return (
      <View style={[ui.screen, { justifyContent: "center", padding: 24 }]}>
        <Text style={[ui.title, { marginBottom: 8 }]}>BacksterOS</Text>
        <Text style={ui.body}>
          Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in backsteros-mobile/.env and
          restart Expo. No demo workspace is shipped on mobile.
        </Text>
        <StatusBar style="light" backgroundColor={colors.background} />
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <View style={ui.screen}>
        <ThemeProvider value={navigationTheme}>
          <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
            <ClerkLoaded>
              <PowerSyncProvider>
                <TabBarVisibilityProvider>
                  <Stack screenOptions={stackScreenOptions}>
                    <Stack.Screen name="index" options={{ title: "BacksterOS" }} />
                    <Stack.Screen name="(app)" options={{ headerShown: false }} />
                    <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
                    <Stack.Screen
                      name="settings"
                      options={{
                        title: "Settings",
                        headerBackButtonDisplayMode: "minimal",
                        gestureEnabled: true,
                        fullScreenGestureEnabled: true,
                      }}
                    />
                    <Stack.Screen name="task/[id]" options={rootDetailOptions} />
                    <Stack.Screen
                      name="project/[id]"
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
                  <StatusBar style="light" backgroundColor={colors.background} />
                </TabBarVisibilityProvider>
              </PowerSyncProvider>
            </ClerkLoaded>
          </ClerkProvider>
        </ThemeProvider>
      </View>
    </AppErrorBoundary>
  );
}

export default wrapRoot(RootLayout);
