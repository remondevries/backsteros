import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { colors } from "../lib/theme";
import { ui } from "../lib/ui";

/**
 * OAuth return route for GitHub connect/reauthorize.
 * Clerk + WebBrowser openAuthSessionAsync land here; bounce to Settings.
 */
export default function SsoCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace({ pathname: "/settings", params: { tab: "github" } });
    }, 400);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ title: "GitHub", headerShown: false }} />
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
        <Text style={[ui.body, { marginTop: 12, color: colors.muted }]}>
          Finishing GitHub connection…
        </Text>
      </View>
    </>
  );
}
