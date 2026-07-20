import type { Organization } from "@backsteros/contracts";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";

export function CreateOrganizationScreen() {
  const router = useRouter();
  const client = useMobileApiClient();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = name.trim().length > 0 && !saving;

  async function onCreate() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await client.requestJson<Organization>("/api/v1/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, sortOrder: -Date.now() }),
      });
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/organizations");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create organization.",
      );
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          headerRight: () => (
            <Pressable
              onPress={() => {
                void onCreate();
              }}
              disabled={!canCreate}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Create organization"
              style={({ pressed }) => ({
                minWidth: 64,
                minHeight: 36,
                alignItems: "center",
                justifyContent: "center",
                opacity: !canCreate ? 0.35 : pressed ? 0.55 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator color={colors.foreground} size="small" />
              ) : (
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 17,
                    fontWeight: "600",
                    lineHeight: 22,
                  }}
                >
                  Create
                </Text>
              )}
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={ui.screen}
        contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Organization name"
            placeholderTextColor={colors.muted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => {
              void onCreate();
            }}
            style={{
              color: colors.foreground,
              fontSize: 24,
              fontWeight: "600",
              lineHeight: 30,
              paddingVertical: 4,
            }}
          />
        </View>
        {error ? (
          <Text style={[ui.error, { paddingHorizontal: 16, paddingTop: 16 }]}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}
