import type { Document } from "@backsteros/contracts";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { TextInput } from "./app-text-input";

function folderPathFromTitle(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "folder";
  return `${slug}-${Date.now().toString(36)}`;
}

/** Create a knowledge (or project) folder. */
export function CreateFolderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    type?: string | string[];
    projectId?: string | string[];
    parentId?: string | string[];
  }>();
  const typeParam = Array.isArray(params.type) ? params.type[0] : params.type;
  const projectId = Array.isArray(params.projectId)
    ? params.projectId[0]
    : params.projectId;
  const parentId = Array.isArray(params.parentId)
    ? params.parentId[0]
    : params.parentId;
  const documentType =
    typeParam === "project" && projectId ? "project" : "knowledge";

  const client = useMobileApiClient();

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = title.trim().length > 0 && !saving;

  async function onCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;
    setSaving(true);
    setError(null);
    try {
      await client.requestJson<Document>("/api/v1/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          documentType === "project"
            ? {
                type: "project",
                projectId,
                kind: "folder",
                title: trimmedTitle,
                path: folderPathFromTitle(trimmedTitle),
                parentId: parentId || undefined,
              }
            : {
                type: "knowledge",
                kind: "folder",
                title: trimmedTitle,
                path: folderPathFromTitle(trimmedTitle),
                parentId: parentId || undefined,
              },
        ),
      });
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/knowledge");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create folder.",
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
              accessibilityLabel="Create folder"
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
      <KeyboardAwareScrollView style={ui.screen}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Folder name"
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
      </KeyboardAwareScrollView>
    </>
  );
}
