import type { Document } from "@backsteros/contracts";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { documentPathFromTitle } from "../lib/compose";
import { documentDetailHref } from "../lib/detail-href";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { TextInput } from "./app-text-input";

/** Compose a new project or knowledge document. */
export function CreateDocumentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    projectId?: string | string[];
    type?: string | string[];
    parentId?: string | string[];
  }>();
  const projectId = Array.isArray(params.projectId)
    ? params.projectId[0]
    : params.projectId;
  const typeParam = Array.isArray(params.type) ? params.type[0] : params.type;
  const parentId = Array.isArray(params.parentId)
    ? params.parentId[0]
    : params.parentId;
  const isKnowledge = typeParam === "knowledge";
  const isProject = Boolean(projectId) && !isKnowledge;

  const client = useMobileApiClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate =
    title.trim().length > 0 && !saving && (isKnowledge || isProject);

  async function onCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;
    if (!isKnowledge && !projectId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await client.requestJson<Document>("/api/v1/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isKnowledge
            ? {
                type: "knowledge",
                title: trimmedTitle,
                path: documentPathFromTitle(trimmedTitle),
                content,
                parentId: parentId || undefined,
              }
            : {
                type: "project",
                projectId,
                title: trimmedTitle,
                path: documentPathFromTitle(trimmedTitle),
                content,
                parentId: parentId || undefined,
              },
        ),
      });
      router.replace(documentDetailHref(created.id));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create document.",
      );
      setSaving(false);
    }
  }

  if (!isKnowledge && !isProject) {
    return (
      <View style={ui.screen}>
        <Text style={ui.error}>Missing project for this document.</Text>
      </View>
    );
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
              accessibilityLabel="Create document"
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
      <KeyboardAwareScrollView
        style={ui.screen}
        keepEndVisibleWhileTyping
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Document title"
            placeholderTextColor={colors.muted}
            autoFocus
            returnKeyType="next"
            style={{
              color: colors.foreground,
              fontSize: 24,
              fontWeight: "600",
              lineHeight: 30,
              paddingVertical: 4,
            }}
          />
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Write something…"
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            style={{
              color: colors.foreground,
              fontSize: 15,
              lineHeight: 22,
              minHeight: 200,
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
