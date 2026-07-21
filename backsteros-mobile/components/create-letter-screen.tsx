import type { Letter } from "@backsteros/contracts";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { letterDetailHref } from "../lib/detail-href";
import {
  pickLetterPdf,
  uploadLetterPdfFromUri,
  type PickedLetterPdf,
} from "../lib/letter-pdf-upload";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { useHideTabBar } from "../lib/tab-bar-visibility";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import {
  FLOATING_PDF_DOCK_CLEARANCE,
  FloatingComposeActionPill,
} from "./floating-compose-action-pill";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { LetterFileChip } from "./letter-file-chip";
import { PlusIcon } from "./plus-icon";
import { TextInput } from "./app-text-input";

/** Compose a new letter — optional project / contact / organization from route params. */
export function CreateLetterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    projectId?: string | string[];
    contactId?: string | string[];
    organizationId?: string | string[];
  }>();
  const projectId = Array.isArray(params.projectId)
    ? params.projectId[0]
    : params.projectId;
  const contactId = Array.isArray(params.contactId)
    ? params.contactId[0]
    : params.contactId;
  const organizationId = Array.isArray(params.organizationId)
    ? params.organizationId[0]
    : params.organizationId;

  const client = useMobileApiClient();

  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [pdf, setPdf] = useState<PickedLetterPdf | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FullWindowOverlay tab bar sits above the system sheet — hide only while picking.
  useHideTabBar(picking);

  const canCreate = title.trim().length > 0 && !saving;

  async function onPickPdf() {
    if (picking || saving) return;
    setPicking(true);
    setError(null);
    try {
      // Wait for header/tab chrome to unmount before the system folder UI.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      const picked = await pickLetterPdf();
      if (picked) {
        setPdf(picked);
        if (!title.trim()) {
          setTitle(picked.name.replace(/\.pdf$/i, ""));
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not pick a PDF.",
      );
    } finally {
      setPicking(false);
    }
  }

  async function onCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await client.requestJson<Letter>("/api/v1/letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          projectId: projectId || null,
          contactId: contactId || null,
          organizationId: organizationId || null,
          context: context.trim() || null,
          status: "triage",
          sortOrder: -Date.now(),
        }),
      });

      if (pdf) {
        const upload = await uploadLetterPdfFromUri(
          client,
          created.id,
          pdf.uri,
          pdf.name,
        );
        if (!upload.ok) {
          setError(upload.error);
          setSaving(false);
          router.replace(letterDetailHref(created.id));
          return;
        }
      }

      router.replace(letterDetailHref(created.id));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create letter.",
      );
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          // Hide stack chrome while the system folder/file picker is up.
          headerShown: !picking,
          headerRight: () => (
            <Pressable
              onPress={() => {
                void onCreate();
              }}
              disabled={!canCreate}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Create letter"
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
      <View style={ui.screen}>
        <KeyboardAwareScrollView
          style={ui.screen}
          bottomClearance={
            FLOATING_TAB_BAR_CLEARANCE + FLOATING_PDF_DOCK_CLEARANCE
          }
          keepEndVisibleWhileTyping
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Letter title"
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
              value={context}
              onChangeText={setContext}
              placeholder="Add notes…"
              placeholderTextColor={colors.muted}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              style={{
                color: colors.foreground,
                fontSize: 15,
                lineHeight: 22,
                minHeight: 120,
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

        {!picking ? (
          <FloatingComposeActionPill
            onPress={() => {
              void onPickPdf();
            }}
            disabled={saving}
            accessibilityLabel={
              pdf ? "Change PDF attachment" : "Upload PDF attachment"
            }
            left={
              pdf ? (
                <LetterFileChip
                  filename={pdf.name}
                  onRemove={() => setPdf(null)}
                  disabled={saving}
                />
              ) : undefined
            }
          >
            {saving ? (
              <ActivityIndicator color={colors.foreground} size="small" />
            ) : (
              <PlusIcon size={22} color={colors.foreground} />
            )}
          </FloatingComposeActionPill>
        ) : null}
      </View>
    </>
  );
}
