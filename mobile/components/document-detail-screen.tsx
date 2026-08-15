import type { Document, DocumentContent } from "@backsteros/contracts";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Text,
  View,
} from "react-native";

import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { TextInput } from "./app-text-input";

type DocMetaRow = {
  id: string;
  title: string | null;
  path: string | null;
};

type Props = {
  documentId: string | undefined;
};

function stripFrontmatter(content: string): string {
  let body = content.replace(/^\uFEFF/, "");
  if (!body.startsWith("---")) return body.replace(/^\n+/, "").replace(/\n+$/, "");
  const end = body.indexOf("\n---", 3);
  if (end === -1) return body.replace(/^\n+/, "").replace(/\n+$/, "");
  return body
    .slice(end + 4)
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

function stripDuplicateTitleHeading(body: string, title: string): string {
  const withoutLeadingNewlines = body.replace(/^\n+/, "");
  const normalizedTitle = title.trim().toLowerCase();
  if (!normalizedTitle) return withoutLeadingNewlines;
  const match = withoutLeadingNewlines.match(/^#\s+(.+?)(?:\r?\n|$)/);
  if (!match) return withoutLeadingNewlines;
  if (match[1]?.trim().toLowerCase() !== normalizedTitle) {
    return withoutLeadingNewlines;
  }
  return withoutLeadingNewlines.slice(match[0].length).replace(/^\n+/, "");
}

function getDocumentDisplayBody(content: string, title: string): string {
  return stripDuplicateTitleHeading(stripFrontmatter(content), title)
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

const META_SQL = `SELECT id, title, path FROM documents
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

const EMPTY_META_SQL = `SELECT id, title, path FROM documents WHERE 0`;

/** Project / knowledge document — Tier D body on open; always inline-editable. */
export function DocumentDetailScreen({ documentId }: Props) {
  const powerSync = useMobilePowerSync();

  const client = useMobileApiClient();

  const { data: syncedMeta } = useLocalQuery<DocMetaRow>(
      documentId ? META_SQL : EMPTY_META_SQL,
      documentId ? [documentId] : [],
    );

  const [body, setBody] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState<number | null>(null);
  const [bodyLoading, setBodyLoading] = useState(true);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState<string | null>(null);

  const syncedTitle = syncedMeta?.[0]?.title ?? null;

  useEffect(() => {
    setLocalTitle(null);
    setSaveError(null);
    setDraftTitle("");
    setDraftBody("");
  }, [documentId]);

  useEffect(() => {
    if (!documentId) {
      setBodyLoading(false);
      setBodyError("Missing document.");
      return;
    }
    let cancelled = false;
    setBodyLoading(true);
    setBodyError(null);
    void client
      .requestJson<DocumentContent>(
        `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
      )
      .then((result) => {
        if (cancelled) return;
        setBody(stripFrontmatter(result.content ?? ""));
        setContentVersion(result.contentVersion);
      })
      .catch((reason) => {
        if (cancelled) return;
        setBody(null);
        setContentVersion(null);
        setBodyError(
          reason instanceof Error ? reason.message : String(reason),
        );
      })
      .finally(() => {
        if (!cancelled) setBodyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, documentId]);

  const resolvedTitle = localTitle ?? syncedTitle;
  const title = resolvedTitle?.trim() || "Document";
  const displayBody = getDocumentDisplayBody(body ?? "", title);
  const bodyReady = Boolean(documentId) && !bodyLoading && !bodyError;

  /** Title/body stay inline-editable — no Edit button. Seed once body is ready. */
  useEffect(() => {
    if (!bodyReady) return;
    setDraftTitle(resolvedTitle?.trim() || "");
    setDraftBody(displayBody);
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed keys only
  }, [documentId, bodyReady]);

  const saveEditing = useCallback(async () => {
    if (!documentId || saving || !bodyReady) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setSaveError("Title is required.");
      return;
    }
    const nextBody = draftBody.replace(/^\n+/, "");
    const titleUnchanged = trimmedTitle === (resolvedTitle?.trim() || "");
    const bodyUnchanged = nextBody === displayBody;
    if (titleUnchanged && bodyUnchanged) {
      setSaveError(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (powerSync.ready) {
        await powerSync.patchDocument(documentId, { title: trimmedTitle });
      }
      await client.requestJson<Document>(
        `/api/v1/documents/${encodeURIComponent(documentId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: trimmedTitle }),
        },
      );
      const contentPayload: { content: string; ifMatchVersion?: number } = {
        content: nextBody,
      };
      if (contentVersion != null) {
        contentPayload.ifMatchVersion = contentVersion;
      }
      const updated = await client.requestJson<DocumentContent>(
        `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(contentPayload),
        },
      );
      setLocalTitle(trimmedTitle);
      setBody(stripFrontmatter(updated.content ?? nextBody));
      setContentVersion(updated.contentVersion);
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : "Could not save document.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    bodyReady,
    client,
    contentVersion,
    displayBody,
    documentId,
    draftBody,
    draftTitle,
    powerSync,
    resolvedTitle,
    saving,
  ]);

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <KeyboardAwareScrollView
        style={ui.screen}
        contentContainerStyle={{
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
        keepEndVisibleWhileTyping
      >
        {bodyLoading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
            <ActivityIndicator color={colors.muted} />
          </View>
        ) : bodyError ? (
          <Text style={[ui.error, { paddingHorizontal: 16, paddingTop: 16 }]}>
            {bodyError}
          </Text>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Document title"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
              onBlur={() => {
                void saveEditing();
              }}
              style={{
                color: colors.foreground,
                fontSize: 24,
                fontWeight: "600",
                lineHeight: 30,
                paddingVertical: 4,
              }}
            />
            <TextInput
              value={draftBody}
              onChangeText={setDraftBody}
              placeholder="Write something…"
              placeholderTextColor={colors.muted}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              onBlur={() => {
                void saveEditing();
              }}
              style={{
                color: colors.foreground,
                fontSize: 15,
                lineHeight: 22,
                minHeight: 280,
                paddingVertical: 4,
              }}
            />
            {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
          </View>
        )}
      </KeyboardAwareScrollView>
    </>
  );
}
