import type { Document, DocumentContent } from "@backsteros/contracts";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import {
  TabStackHeaderTextButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { JournalMarkdownBody } from "./journal-markdown-body";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";

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

/** Project / knowledge document — Tier D body on open; Edit like tasks. */
export function DocumentDetailScreen({ documentId }: Props) {
  const powerSync = useMobilePowerSync();

  const client = useMobileApiClient();

  const { data: syncedMeta, isLoading: metaLoading } =
    useLocalQuery<DocMetaRow>(
      documentId ? META_SQL : EMPTY_META_SQL,
      documentId ? [documentId] : [],
    );

  const [restTitle, setRestTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState<number | null>(null);
  const [bodyLoading, setBodyLoading] = useState(true);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState<string | null>(null);

  const syncedTitle = syncedMeta?.[0]?.title ?? null;

  useEffect(() => {
    setLocalTitle(null);
    setEditing(false);
    setSaveError(null);
    setDraftTitle("");
    setDraftBody("");
  }, [documentId]);

  useEffect(() => {
    if (!documentId || syncedTitle || powerSync.ready) return;
    let cancelled = false;
    void client
      .requestJson<Document>(
        `/api/v1/documents/${encodeURIComponent(documentId)}`,
      )
      .then((document) => {
        if (!cancelled) setRestTitle(document.title);
      })
      .catch(() => {
        if (!cancelled) setRestTitle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, documentId, syncedTitle, powerSync.ready]);

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

  const resolvedTitle =
    localTitle ??
    syncedTitle ??
    (!powerSync.ready || metaLoading ? restTitle : null);

  const title = resolvedTitle?.trim() || "Document";
  const displayBody = getDocumentDisplayBody(body ?? "", title);
  const canEdit = Boolean(documentId) && !bodyLoading && !bodyError;

  const startEditing = useCallback(() => {
    if (!documentId) return;
    setDraftTitle(resolvedTitle?.trim() || "");
    setDraftBody(displayBody);
    setSaveError(null);
    setEditing(true);
  }, [displayBody, documentId, resolvedTitle]);


  async function saveEditing() {
    if (!documentId || saving) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setSaveError("Title is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const nextBody = draftBody.replace(/^\n+/, "");
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
      setRestTitle(trimmedTitle);
      setBody(stripFrontmatter(updated.content ?? nextBody));
      setContentVersion(updated.contentVersion);
      setEditing(false);
      setDraftTitle("");
      setDraftBody("");
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : "Could not save document.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <>
        <Stack.Screen
          options={{
            ...tabDetailScreenOptions(),
            headerRight: () => (
              <TabStackHeaderTextButton
                label="Save"
                onPress={() => {
                  void saveEditing();
                }}
                loading={saving}
                disabled={saving || !draftTitle.trim()}
              />
            ),
          }}
        />
        <KeyboardAwareScrollView
          style={ui.screen}
          keepEndVisibleWhileTyping
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
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
              value={draftBody}
              onChangeText={setDraftBody}
              placeholder="Write something…"
              placeholderTextColor={colors.muted}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              style={{
                color: colors.foreground,
                fontSize: 15,
                lineHeight: 22,
                minHeight: 280,
                paddingVertical: 4,
              }}
            />
          </View>
          {saveError ? (
            <Text style={[ui.error, { paddingHorizontal: 16 }]}>
              {saveError}
            </Text>
          ) : null}
        </KeyboardAwareScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          headerRight: () => (
            <TabStackHeaderTextButton
              label="Edit"
              onPress={startEditing}
              disabled={!canEdit}
            />
          ),
        }}
      />
      <ScrollView
        style={ui.screen}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
          gap: 16,
        }}
      >
        <Text style={ui.detailTitle}>{title}</Text>
        {bodyLoading ? (
          <ActivityIndicator color={colors.muted} />
        ) : bodyError ? (
          <Text style={ui.error}>{bodyError}</Text>
        ) : displayBody.trim() ? (
          <JournalMarkdownBody body={displayBody} />
        ) : (
          <Text style={ui.rowMeta}>No content yet.</Text>
        )}
      </ScrollView>
    </>
  );
}
