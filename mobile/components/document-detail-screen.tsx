import type { Document, DocumentContent } from "@backsteros/contracts";
import { Stack, useSegments } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { isPadDevice } from "../lib/device";
import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { DetailContentContainer } from "./detail-content-container";
import { DocumentOcticon } from "./document-octicon";
import { JournalMarkdownBody } from "./journal-markdown-body";
import { SegmentedPillToggle } from "./segmented-pill-toggle";
import { TextInput } from "./app-text-input";

type DocMetaRow = {
  id: string;
  title: string | null;
  path: string | null;
  icon: string | null;
};

type Props = {
  documentId: string | undefined;
};

type DocumentViewMode = "edit" | "preview";

const VIEW_MODE_OPTIONS = [
  { value: "edit" as const, label: "Edit" },
  { value: "preview" as const, label: "Preview" },
];

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

const META_SQL = `SELECT id, title, path, icon FROM documents
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

const EMPTY_META_SQL = `SELECT id, title, path, icon FROM documents WHERE 0`;

/**
 * Project / knowledge document — Tier D body on open.
 * Desktop parity: Edit / Preview toggle with rendered markdown in preview.
 */
export function DocumentDetailScreen({ documentId }: Props) {
  const powerSync = useMobilePowerSync();
  const isPad = isPadDevice();
  const segments = useSegments();
  const inPadKnowledgeSplit =
    isPad && (segments as string[]).includes("knowledge");

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
  const [viewMode, setViewMode] = useState<DocumentViewMode>("preview");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState<string | null>(null);

  const syncedTitle = syncedMeta?.[0]?.title ?? null;
  const documentIcon = syncedMeta?.[0]?.icon ?? null;

  useEffect(() => {
    setLocalTitle(null);
    setSaveError(null);
    setDraftTitle("");
    setDraftBody("");
    setViewMode("preview");
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

  /** Seed drafts once body is ready. Keep local draft while actively editing. */
  useEffect(() => {
    if (!bodyReady) return;
    if (viewMode === "edit") return;
    setDraftTitle(resolvedTitle?.trim() || "");
    setDraftBody(displayBody);
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed on open / remote body
  }, [documentId, bodyReady, body, contentVersion, viewMode]);

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

  const handleViewModeChange = useCallback(
    (next: DocumentViewMode) => {
      if (next === viewMode) return;
      if (viewMode === "edit" && next === "preview") {
        void saveEditing();
      }
      setViewMode(next);
    },
    [saveEditing, viewMode],
  );

  const editors = (
    <View style={styles.content}>
      <View
        style={styles.iconChip}
        accessibilityLabel={`Document icon for ${draftTitle.trim() || title}`}
      >
        <DocumentOcticon icon={documentIcon} size={16} />
      </View>
      {viewMode === "edit" ? (
        <>
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="Document title"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            onBlur={() => {
              void saveEditing();
            }}
            style={styles.titleInput}
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
            style={styles.bodyInput}
          />
        </>
      ) : (
        <>
          <Text style={styles.titlePreview} accessibilityRole="header">
            {draftTitle.trim() || "Untitled"}
          </Text>
          {draftBody.trim() ? (
            <JournalMarkdownBody body={draftBody} />
          ) : (
            <Text style={styles.emptyHint}>This document is empty.</Text>
          )}
        </>
      )}
      {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions({ embedded: isPad }),
          ...(inPadKnowledgeSplit ? { headerBackVisible: false } : null),
        }}
      />
      <View style={styles.root}>
        <KeyboardAwareScrollView
          style={ui.screen}
          contentContainerStyle={styles.scrollContent}
          keepEndVisibleWhileTyping
        >
          {bodyLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : bodyError ? (
            <Text style={[ui.error, styles.errorPad]}>{bodyError}</Text>
          ) : (
            <DetailContentContainer constrained={isPad}>
              {editors}
            </DetailContentContainer>
          )}
        </KeyboardAwareScrollView>

        {!bodyLoading && !bodyError ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.viewModeDock,
              { bottom: isPad ? 16 : FLOATING_TAB_BAR_CLEARANCE - 40 },
            ]}
          >
            <View style={styles.viewModeDockInner}>
              <SegmentedPillToggle
                value={viewMode}
                options={VIEW_MODE_OPTIONS}
                onChange={handleViewModeChange}
                accessibilityLabel="Document view mode"
              />
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: FLOATING_TAB_BAR_CLEARANCE + 24,
  },
  loading: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  errorPad: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  iconChip: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  titleInput: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
    paddingVertical: 4,
  },
  titlePreview: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
    paddingVertical: 4,
  },
  bodyInput: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 280,
    paddingVertical: 4,
  },
  emptyHint: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 4,
  },
  viewModeDock: {
    position: "absolute",
    right: 16,
    zIndex: 10,
  },
  viewModeDockInner: {
    padding: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
