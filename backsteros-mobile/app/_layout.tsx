import "@azure/core-asynciterator-polyfill";

import { ClerkProvider, ClerkLoaded } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";

import { getMobileEnvironment } from "../lib/env";

const publishableKey = getMobileEnvironment().clerkPublishableKey;

export default function RootLayout() {
  if (!publishableKey) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 8 }}>
          BacksterOS
        </Text>
        <Text style={{ color: "#666", lineHeight: 22 }}>
          Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in backsteros-mobile/.env and
          restart Expo. No demo workspace is shipped on mobile.
        </Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <Stack screenOptions={{ headerShown: true }}>
          <Stack.Screen name="index" options={{ title: "BacksterOS" }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
        </Stack>
        <StatusBar style="auto" />
      </ClerkLoaded>
    </ClerkProvider>
  );
}
