import type { TaskLink } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  coerceSparkEmailUrl,
  createTaskLinkId,
  isAppDocumentTaskLinkUrl,
  isAppEmailTaskLinkUrl,
  isAppLetterTaskLinkUrl,
  isGithubTaskLinkUrl,
  isSparkEmailTaskLinkUrl,
  MAX_TASK_LINKS,
  normalizeTaskLinkUrl,
  taskLinkDisplayLabel,
} from "../lib/task-links";
import { colors } from "../lib/theme";
import { TextInput } from "./app-text-input";
import { DocumentIcon } from "./document-icon";
import { LetterIcon } from "./letter-icon";
import { EmailNavIcon } from "./nav-icons";
import { PrimerOcticon } from "./primer-octicon";

type Props = {
  links: TaskLink[];
  onChangeLinks: (links: TaskLink[]) => void;
  readOnly?: boolean;
};

function PaperclipIcon({
  size = 13,
  color = colors.muted,
}: {
  size?: number;
  color?: string;
}) {
  return <PrimerOcticon name="paperclip" size={size} color={color} />;
}

function TaskLinkFavicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return <PrimerOcticon name="link" size={16} color={colors.muted} />;
  }
  if (failed || !host) {
    return <PrimerOcticon name="link" size={16} color={colors.muted} />;
  }
  return (
    <Image
      source={{
        uri: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`,
      }}
      style={styles.favicon}
      onError={() => setFailed(true)}
    />
  );
}

function TaskLinkIcon({ url }: { url: string }) {
  if (isSparkEmailTaskLinkUrl(url) || isAppEmailTaskLinkUrl(url)) {
    return <EmailNavIcon size={16} color={colors.muted} />;
  }
  if (isAppLetterTaskLinkUrl(url)) {
    return <LetterIcon size={16} color={colors.muted} />;
  }
  if (isAppDocumentTaskLinkUrl(url)) {
    return <DocumentIcon size={16} color={colors.muted} />;
  }
  if (isGithubTaskLinkUrl(url)) {
    return <PrimerOcticon name="mark-github" size={16} color={colors.muted} />;
  }
  return <TaskLinkFavicon url={url} />;
}

function resolveMobileHref(url: string): string {
  return coerceSparkEmailUrl(url) ?? url;
}

/**
 * Desktop-parity task link attachments: paperclip add + row list with icon,
 * label, and remove. Native RN layout (no shared visual UI).
 */
export function TaskLinkAttachments({
  links,
  onChangeLinks,
  readOnly = false,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const remoteKey = useMemo(() => JSON.stringify(links), [links]);
  const [items, setItems] = useState(links);
  const [itemsSourceKey, setItemsSourceKey] = useState(remoteKey);
  if (remoteKey !== itemsSourceKey) {
    setItemsSourceKey(remoteKey);
    setItems(links);
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const openModal = useCallback(() => {
    setDraftUrl("");
    setFormError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setDraftUrl("");
    setFormError(null);
  }, []);

  function appendLink(url: string) {
    if (items.length >= MAX_TASK_LINKS) {
      setFormError(`You can attach up to ${MAX_TASK_LINKS} links.`);
      return;
    }
    const normalized = normalizeTaskLinkUrl(url);
    if (!normalized) {
      setFormError("Enter a valid URL.");
      return;
    }
    if (items.some((item) => item.url === normalized)) {
      setFormError("This link is already attached.");
      return;
    }
    const next = [
      ...items,
      {
        id: createTaskLinkId(),
        url: normalized,
        createdAt: new Date().toISOString(),
      },
    ];
    setItems(next);
    onChangeLinks(next);
    closeModal();
  }

  function handleRemove(id: string) {
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    onChangeLinks(next);
  }

  function openLink(url: string) {
    const href = resolveMobileHref(url);
    if (href.startsWith("/email/")) {
      const match = href.match(/^\/email\/([^/]+)\/([^/?#]+)/i);
      if (match?.[1] && match[2]) {
        router.push(
          `/email/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`,
        );
        return;
      }
    }
    if (href.startsWith("/letter/")) {
      const id = href.split("/")[2];
      if (id) {
        router.push(`/letter/${encodeURIComponent(id)}`);
        return;
      }
    }
    if (href.startsWith("/document/")) {
      const id = href.split("/")[2];
      if (id) {
        router.push(`/document/${encodeURIComponent(id)}`);
        return;
      }
    }
    void Linking.openURL(href).catch(() => undefined);
  }

  const canEdit = !readOnly;
  const hasRows = items.length > 0;
  // Keep the block mounted so add is always available (desktop parity).
  if (!hasRows && !canEdit) return null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Attachments</Text>
        {canEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add attachment"
            hitSlop={8}
            onPress={openModal}
            style={({ pressed }) => [
              styles.addButton,
              pressed ? { opacity: 0.65 } : null,
            ]}
          >
            <PaperclipIcon size={14} color={colors.foreground} />
          </Pressable>
        ) : null}
      </View>

      {hasRows ? (
        <View style={styles.list}>
          {items.map((item) => {
            const href = resolveMobileHref(item.url);
            const label = taskLinkDisplayLabel(href);
            return (
              <View key={item.id} style={styles.row}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={label}
                  onPress={() => openLink(item.url)}
                  style={({ pressed }) => [
                    styles.link,
                    pressed ? { opacity: 0.75 } : null,
                  ]}
                >
                  <View style={styles.iconWrap} accessibilityElementsHidden>
                    <TaskLinkIcon url={href} />
                  </View>
                  <Text style={styles.label} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
                {canEdit ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove link"
                    hitSlop={8}
                    onPress={() => handleRemove(item.id)}
                    style={({ pressed }) => [
                      styles.remove,
                      pressed ? { opacity: 0.65 } : null,
                    ]}
                  >
                    <PrimerOcticon name="x" size={12} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyHint}>No attachments yet</Text>
      )}

      <Modal
        visible={modalOpen}
        animationType="fade"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={styles.backdrop}
            onPress={closeModal}
          />
          <View
            style={[
              styles.dialog,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <Text style={styles.dialogTitle}>Add attachment</Text>
            <Text style={styles.dialogBody}>
              Paste a link to attach it to this task.
            </Text>
            <TextInput
              value={draftUrl}
              onChangeText={(next) => {
                setDraftUrl(next);
                if (formError) setFormError(null);
              }}
              placeholder="https://…"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              style={styles.input}
            />
            {formError ? (
              <Text style={styles.error} accessibilityRole="alert">
                {formError}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={closeModal}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed ? { opacity: 0.7 } : null,
                ]}
              >
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => appendLink(draftUrl)}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed ? { opacity: 0.85 } : null,
                ]}
              >
                <Text style={styles.saveLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    marginTop: 12,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  emptyHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 40,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  link: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 10,
  },
  iconWrap: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  favicon: {
    width: 16,
    height: 16,
  },
  label: {
    flex: 1,
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 20,
  },
  remove: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(255, 255, 255, 0.08)",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  dialogTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "600",
  },
  dialogBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.foreground,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  cancelLabel: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.buttonBg,
  },
  saveLabel: {
    color: colors.buttonText,
    fontSize: 15,
    fontWeight: "600",
  },
});
