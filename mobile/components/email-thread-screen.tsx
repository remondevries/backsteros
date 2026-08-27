import type {
  AgentMailMessageAttachment,
  AgentMailMessageDetail,
} from "@backsteros/contracts";
import { File, Paths } from "expo-file-system";
import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAgentMail } from "../lib/agentmail-context";
import { isPadDevice } from "../lib/device";
import { formatEmailDisplayId } from "../lib/email-display-id";
import { emailMessagePlainBody } from "../lib/email-message-html";
import {
  discardEmailMessageDetailCache,
  fetchEmailMessageDetail,
} from "../lib/email-message-detail";
import type { EmailMessageSourceDetail } from "../lib/email-message-source";
import {
  EMAIL_THREAD_BODY_VIEW_MODE_LABELS,
  EMAIL_THREAD_BODY_VIEW_MODES,
  getRememberedEmailThreadBodyViewMode,
  rememberEmailThreadBodyViewMode,
  type EmailThreadBodyViewMode,
} from "../lib/email-thread-body-view-mode";
import {
  patchEmailThreadMetadata,
  type EmailThreadMetadataPatch,
  type EmailThreadPatchExtras,
} from "../lib/email-thread-metadata";
import {
  attachmentLabel,
  resolveEmailThreadMessagePresentation,
  visibleEmailAttachments,
} from "../lib/email-thread-message-presentation";
import {
  resolveEmailThreadPropertiesFromDetail,
  resolveEmailThreadPropertiesFromListItem,
  type ResolvedEmailThreadProperties,
} from "../lib/email-thread-properties";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import {
  TabStackHeaderIconButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { formatTaskDueMetaLabel } from "../lib/task-due-date";
import { getTaskPriorityLabel } from "../lib/task-priority";
import {
  getTaskStatusLabel,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import {
  dispatchEmailListRemove,
  dispatchEmailListReload,
} from "../lib/use-agentmail-mailboxes";
import { ContactPersonIcon } from "./contact-person-icon";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { DueDatePropertySheet } from "./due-date-property-sheet";
import { FeatureErrorBoundary } from "./feature-error-boundary";
import { EmailThreadMessageCard } from "./email-thread-message-card";
import { MoreHorizontalIcon } from "./more-horizontal-icon";
import { OrganizationIcon } from "./organization-icon";
import { ProjectIcon } from "./project-icon";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";

type Props = {
  inboxId: string | undefined;
  messageId: string | undefined;
};

type PickerKind =
  | "status"
  | "priority"
  | "due"
  | "organization"
  | "contact"
  | "assignee"
  | "project"
  | null;

type NamedOptionRow = { id: string; name: string | null };
type ContactOptionRow = NamedOptionRow & {
  organization_id: string | null;
  email: string | null;
  avatar_storage_key: string | null;
};
type ProjectOptionRow = NamedOptionRow & { key: string | null };

const PROJECTS_SQL = `SELECT id, name, key FROM projects
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const ORGANIZATIONS_SQL = `SELECT id, name FROM organizations
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const CONTACTS_SQL = `SELECT id, name, organization_id, email, avatar_storage_key FROM contacts
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const PRIORITY_VALUES = [0, 1, 2, 3, 4] as const;

type ThreadMessage = {
  messageId: string;
  subject: string;
  from: string;
  to: string[];
  timestamp: string;
  text: string | null;
  html: string | null;
  extractedText: string | null;
  extractedHtml: string | null;
  attachments?: AgentMailMessageAttachment[];
};

/**
 * Email thread detail — message cards oldest → newest with WebView bodies,
 * editable status / due date, reply, mark unread, report spam, delete
 * (desktop email side-panel core parity).
 */
export function EmailThreadScreen({ inboxId, messageId }: Props) {
  const client = useMobileApiClient();
  const router = useRouter();
  const segments = useSegments();
  const { mailboxes, messages: listMessages, reload: reloadList } = useAgentMail();
  // Threads open from the Email section, Inbox rows, or Tasks rows — keep
  // reply/back navigation inside whichever stack the thread was opened in.
  const section = (segments as string[]).includes("inbox")
    ? "inbox"
    : (segments as string[]).includes("tasks")
      ? "tasks"
      : "email";
  const sectionBase =
    section === "inbox"
      ? ("/(app)/inbox" as const)
      : section === "tasks"
        ? ("/(app)/tasks" as const)
        : ("/(app)/email" as const);
  const composePath =
    section === "inbox"
      ? ("/(app)/inbox/email/compose" as const)
      : section === "tasks"
        ? ("/(app)/tasks/email/compose" as const)
        : ("/(app)/email/compose" as const);
  const inPadSplit = isPadDevice();
  const isPhone = !isPadDevice();

  const [bodyViewMode, setBodyViewMode] = useState<EmailThreadBodyViewMode>(
    getRememberedEmailThreadBodyViewMode,
  );
  const messageSourceCacheRef = useRef(
    new Map<string, Promise<EmailMessageSourceDetail>>(),
  );

  const [detail, setDetail] = useState<AgentMailMessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [status, setStatus] = useState<TaskStatus>("triage");
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [metadataNames, setMetadataNames] = useState({
    organizationName: null as string | null,
    contactName: null as string | null,
    assigneeName: null as string | null,
    projectName: null as string | null,
    projectKey: null as string | null,
  });
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<
    string | null
  >(null);

  const { data: syncedProjects } = useLocalQuery<ProjectOptionRow>(PROJECTS_SQL);
  const { data: syncedOrganizations } =
    useLocalQuery<NamedOptionRow>(ORGANIZATIONS_SQL);
  const { data: syncedContacts } =
    useLocalQuery<ContactOptionRow>(CONTACTS_SQL);
  const projects = useMemo(() => syncedProjects ?? [], [syncedProjects]);
  const organizations = useMemo(
    () => syncedOrganizations ?? [],
    [syncedOrganizations],
  );
  const contacts = useMemo(() => syncedContacts ?? [], [syncedContacts]);

  const mailboxContactEntities = useMemo(
    () =>
      mailboxes
        .filter((mailbox) => mailbox.contactId)
        .map((mailbox) => ({
          id: mailbox.contactId!,
          avatarStorageKey:
            contacts.find((contact) => contact.id === mailbox.contactId)
              ?.avatar_storage_key ?? null,
        })),
    [contacts, mailboxes],
  );
  const mailboxAvatarByContactId = useEntityAvatarSrcMap(
    "contact",
    mailboxContactEntities,
    client,
  );
  const threadContact = useMemo(
    () => contacts.find((entry) => entry.id === contactId) ?? null,
    [contactId, contacts],
  );
  const threadContactAvatarSrc = useEntityAvatarSrcMap(
    "contact",
    threadContact?.avatar_storage_key
      ? [{ id: threadContact.id, avatarStorageKey: threadContact.avatar_storage_key }]
      : [],
    client,
  )[threadContact?.id ?? ""] ?? null;

  const listItem = useMemo(
    () =>
      inboxId && messageId
        ? (listMessages.find(
            (item) => item.inboxId === inboxId && item.id === messageId,
          ) ?? null)
        : null,
    [inboxId, listMessages, messageId],
  );

  const applyThreadProperties = useCallback(
    (props: ResolvedEmailThreadProperties) => {
      setStatus(props.status);
      setPriority(props.priority);
      setDueDate(props.dueDate);
      setOrganizationId(props.organizationId);
      setContactId(props.contactId);
      setAssigneeId(props.assigneeId);
      setProjectId(props.projectId);
      setDisplayId(props.displayId);
      setMetadataNames({
        organizationName: props.organizationName,
        contactName: props.contactName,
        assigneeName: props.assigneeName,
        projectName: props.projectName,
        projectKey: props.projectKey,
      });
    },
    [],
  );

  useEffect(() => {
    if (!listItem) return;
    applyThreadProperties(resolveEmailThreadPropertiesFromListItem(listItem));
  }, [applyThreadProperties, listItem]);

  useEffect(() => {
    if (!inboxId || !messageId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchEmailMessageDetail(client, inboxId, messageId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result) {
        setError("Could not load this email.");
        return;
      }
      setDetail(result);
      applyThreadProperties(
        resolveEmailThreadPropertiesFromDetail(result, listItem),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [applyThreadProperties, client, inboxId, listItem, messageId]);

  const messages = useMemo<ThreadMessage[]>(() => {
    if (!detail) return [];
    if (detail.threadMessages && detail.threadMessages.length > 0) {
      // Phone: newest on top (no scroll to reach the latest reply).
      // iPad split: oldest → newest like the desktop thread view.
      const newestFirst = !isPadDevice();
      return [...detail.threadMessages].sort((left, right) => {
        const delta =
          (Date.parse(left.timestamp) || 0) - (Date.parse(right.timestamp) || 0);
        return newestFirst ? -delta : delta;
      });
    }
    return [
      {
        messageId: detail.messageId,
        subject: detail.subject,
        from: detail.from,
        to: detail.to ?? [],
        timestamp: detail.timestamp,
        text: detail.text,
        html: detail.html,
        extractedText: detail.extractedText,
        extractedHtml: detail.extractedHtml,
        attachments: detail.attachments,
      },
    ];
  }, [detail]);

  const statusOptions = useMemo<PropertyOption<TaskStatus>[]>(
    () =>
      TASK_STATUS_ORDER.map((value) => ({
        value,
        label: getTaskStatusLabel(value),
        icon: <TaskStatusIcon status={value} size={16} />,
      })),
    [],
  );

  const priorityOptions = useMemo<PropertyOption<number>[]>(
    () =>
      PRIORITY_VALUES.map((value) => ({
        value,
        label: getTaskPriorityLabel(value),
        icon: <TaskPriorityIcon priority={value} size={14} />,
      })),
    [],
  );

  const organizationOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No organization",
        icon: <OrganizationIcon size={14} />,
      },
      ...organizations.map((organization) => ({
        value: organization.id,
        label: organization.name?.trim() || "Untitled",
        icon: <OrganizationIcon size={14} />,
      })),
    ],
    [organizations],
  );

  const contactOptions = useMemo<PropertyOption<string | null>[]>(() => {
    const scoped = organizationId
      ? contacts.filter(
          (contact) =>
            contact.organization_id === organizationId ||
            contact.id === contactId,
        )
      : contacts;
    return [
      {
        value: null,
        label: "No contact",
        icon: <ContactPersonIcon size={14} />,
      },
      ...scoped.map((contact) => ({
        value: contact.id,
        label: contact.name?.trim() || "Untitled",
        icon: <ContactPersonIcon size={14} />,
      })),
    ];
  }, [contactId, contacts, organizationId]);

  const assigneeOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No assignee",
        icon: <ContactPersonIcon size={14} />,
      },
      ...contacts.map((contact) => ({
        value: contact.id,
        label: contact.name?.trim() || "Untitled",
        icon: <ContactPersonIcon size={14} />,
      })),
    ],
    [contacts],
  );

  const projectOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      { value: null, label: "No project", icon: <ProjectIcon size={14} /> },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name?.trim() || "Untitled",
        icon: <ProjectIcon size={14} />,
      })),
    ],
    [projects],
  );

  const patchMetadata = useCallback(
    async (
      patch: EmailThreadMetadataPatch,
      listExtras?: EmailThreadPatchExtras,
    ) => {
      if (!detail) return;
      setActionError(null);
      try {
        await patchEmailThreadMetadata(
          client,
          {
            inboxId: detail.inboxId,
            id: detail.messageId,
            threadId: detail.threadId ?? null,
          },
          patch,
          listExtras,
        );
      } catch {
        setActionError("Could not update the thread.");
      }
    },
    [client, detail],
  );

  const goBackToList = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(sectionBase);
  }, [router, sectionBase]);

  const onReply = useCallback(() => {
    if (!detail) return;
    router.push({
      pathname: composePath,
      params: {
        inboxId: detail.inboxId,
        replyTo: detail.messageId,
        subject: detail.subject ?? "",
        replyToFrom: detail.from ?? "",
      },
    });
  }, [composePath, detail, router]);

  const onMarkUnread = useCallback(() => {
    if (!detail || busyAction) return;
    setBusyAction("unread");
    setActionError(null);
    void client
      .requestJson(
        `/api/v1/email/inboxes/${encodeURIComponent(detail.inboxId)}/messages/${encodeURIComponent(detail.messageId)}/mark-unread`,
        { method: "POST" },
      )
      .then(() => {
        discardEmailMessageDetailCache(detail.inboxId, detail.messageId);
        dispatchEmailListReload();
        goBackToList();
      })
      .catch(() => setActionError("Could not mark as unread."))
      .finally(() => setBusyAction(null));
  }, [busyAction, client, detail, goBackToList]);

  const onReportSpam = useCallback(() => {
    if (!detail || busyAction) return;
    Alert.alert(
      "Report spam",
      "Report this thread as spam and block the sender?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report spam",
          style: "destructive",
          onPress: () => {
            setBusyAction("spam");
            setActionError(null);
            void client
              .requestJson(
                `/api/v1/email/inboxes/${encodeURIComponent(detail.inboxId)}/messages/${encodeURIComponent(detail.messageId)}/report-spam`,
                { method: "POST" },
              )
              .then(() => {
                discardEmailMessageDetailCache(detail.inboxId, detail.messageId);
                dispatchEmailListRemove({
                  inboxId: detail.inboxId,
                  messageId: detail.messageId,
                  threadId: detail.threadId ?? null,
                });
                goBackToList();
              })
              .catch(() => setActionError("Could not report spam."))
              .finally(() => setBusyAction(null));
          },
        },
      ],
    );
  }, [busyAction, client, detail, goBackToList]);

  const onDelete = useCallback(() => {
    if (!detail || busyAction) return;
    Alert.alert("Delete email", "Delete this thread from the inbox?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setBusyAction("delete");
          setActionError(null);
          void client
            .requestJson(
              `/api/v1/email/inboxes/${encodeURIComponent(detail.inboxId)}/messages/${encodeURIComponent(detail.messageId)}`,
              { method: "DELETE" },
            )
            .then(() => {
              discardEmailMessageDetailCache(detail.inboxId, detail.messageId);
              dispatchEmailListRemove({
                inboxId: detail.inboxId,
                messageId: detail.messageId,
                threadId: detail.threadId ?? null,
              });
              void reloadList();
              goBackToList();
            })
            .catch(() => setActionError("Could not delete this email."))
            .finally(() => setBusyAction(null));
        },
      },
    ]);
  }, [busyAction, client, detail, goBackToList, reloadList]);

  const onOpenAttachment = useCallback(
    async (message: ThreadMessage, attachment: AgentMailMessageAttachment) => {
      if (!detail || downloadingAttachmentId) return;
      setDownloadingAttachmentId(attachment.attachmentId);
      setActionError(null);
      try {
        const blob = await client.requestBinary(
          `/api/v1/email/inboxes/${encodeURIComponent(detail.inboxId)}/messages/${encodeURIComponent(message.messageId)}/attachments/${encodeURIComponent(attachment.attachmentId)}`,
        );
        const bytes =
          typeof blob.arrayBuffer === "function"
            ? new Uint8Array(await blob.arrayBuffer())
            : new Uint8Array(await new Response(blob).arrayBuffer());
        const safeName = attachmentLabel(attachment).replace(
          /[^\w.\- ]+/g,
          "_",
        );
        const file = new File(Paths.cache, `email-attachment-${safeName}`);
        file.create({ overwrite: true });
        file.write(bytes);
        await Share.share({ url: file.uri });
      } catch {
        setActionError("Could not open the attachment.");
      } finally {
        setDownloadingAttachmentId(null);
      }
    },
    [client, detail, downloadingAttachmentId],
  );

  const openReplyComposer = useCallback(
    (targetMessageId: string, targetSubject: string, targetFrom: string) => {
      if (!detail) return;
      router.push({
        pathname: composePath,
        params: {
          inboxId: detail.inboxId,
          replyTo: targetMessageId,
          subject: targetSubject,
          replyToFrom: targetFrom,
        },
      });
    },
    [composePath, detail, router],
  );

  const markMessagesUnread = useCallback(
    (messageIds: string[]) => {
      if (!detail || busyAction || messageIds.length === 0) return;
      setBusyAction("unread");
      setActionError(null);
      void Promise.allSettled(
        messageIds.map((id) =>
          client.requestJson(
            `/api/v1/email/inboxes/${encodeURIComponent(detail.inboxId)}/messages/${encodeURIComponent(id)}/mark-unread`,
            { method: "POST" },
          ),
        ),
      )
        .then(() => {
          discardEmailMessageDetailCache(detail.inboxId, detail.messageId);
          dispatchEmailListReload();
          goBackToList();
        })
        .catch(() => setActionError("Could not mark as unread."))
        .finally(() => setBusyAction(null));
    },
    [busyAction, client, detail, goBackToList],
  );

  const deleteThreadMessage = useCallback(
    (targetMessageId: string) => {
      if (!detail || busyAction) return;
      Alert.alert("Delete email", "Delete this message from the thread?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setBusyAction("delete");
            setActionError(null);
            void client
              .requestJson(
                `/api/v1/email/inboxes/${encodeURIComponent(detail.inboxId)}/messages/${encodeURIComponent(targetMessageId)}`,
                { method: "DELETE" },
              )
              .then(() => {
                discardEmailMessageDetailCache(detail.inboxId, detail.messageId);
                dispatchEmailListRemove({
                  inboxId: detail.inboxId,
                  messageId: targetMessageId,
                  threadId: detail.threadId ?? null,
                });
                void reloadList();
                goBackToList();
              })
              .catch(() => setActionError("Could not delete this email."))
              .finally(() => setBusyAction(null));
          },
        },
      ]);
    },
    [busyAction, client, detail, goBackToList, reloadList],
  );

  const reportSpamMessage = useCallback(
    (targetMessageId: string) => {
      if (!detail || busyAction) return;
      Alert.alert(
        "Report spam",
        "Report this message as spam and block the sender?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Report spam",
            style: "destructive",
            onPress: () => {
              setBusyAction("spam");
              setActionError(null);
              void client
                .requestJson(
                  `/api/v1/email/inboxes/${encodeURIComponent(detail.inboxId)}/messages/${encodeURIComponent(targetMessageId)}/report-spam`,
                  { method: "POST" },
                )
                .then(() => {
                  discardEmailMessageDetailCache(detail.inboxId, detail.messageId);
                  dispatchEmailListRemove({
                    inboxId: detail.inboxId,
                    messageId: targetMessageId,
                    threadId: detail.threadId ?? null,
                  });
                  goBackToList();
                })
                .catch(() => setActionError("Could not report spam."))
                .finally(() => setBusyAction(null));
            },
          },
        ],
      );
    },
    [busyAction, client, detail, goBackToList],
  );

  const loadMessageSource = useCallback(
    (sourceInboxId: string, sourceMessageId: string) => {
      const key = `${sourceInboxId}:${sourceMessageId}`;
      const cache = messageSourceCacheRef.current;
      const existing = cache.get(key);
      if (existing) return existing;
      const promise = client
        .requestJson<{
          messageId: string;
          sizeBytes: number;
          headers: { name: string; value: string }[];
          raw: string;
        }>(
          `/api/v1/email/inboxes/${encodeURIComponent(sourceInboxId)}/messages/${encodeURIComponent(sourceMessageId)}/source`,
        )
        .then((result) => ({
          sizeBytes: result.sizeBytes,
          headers: result.headers,
          raw: result.raw,
        }))
        .catch((reason: unknown) => {
          cache.delete(key);
          throw reason;
        });
      cache.set(key, promise);
      return promise;
    },
    [client],
  );

  const downloadThreadMessage = useCallback(
    async (targetMessageId: string, targetSubject: string) => {
      if (!detail) return;
      try {
        const source = await loadMessageSource(detail.inboxId, targetMessageId);
        const safeName = (targetSubject.trim() || "message")
          .replace(/[\\/:*?"<>|]+/g, "-")
          .slice(0, 80);
        const file = new File(Paths.cache, `${safeName}.eml`);
        file.create({ overwrite: true });
        file.write(source.raw);
        await Share.share({ url: file.uri });
      } catch {
        setActionError("Could not download this message.");
      }
    },
    [detail, loadMessageSource],
  );

  const showBodyViewModeMenu = useCallback(() => {
    const options = [
      ...EMAIL_THREAD_BODY_VIEW_MODES.map((mode) =>
        mode === bodyViewMode
          ? `✓ ${EMAIL_THREAD_BODY_VIEW_MODE_LABELS[mode]}`
          : EMAIL_THREAD_BODY_VIEW_MODE_LABELS[mode],
      ),
      "Cancel",
    ];
    const cancelButtonIndex = options.length - 1;

    const onSelect = (index: number) => {
      if (index < 0 || index >= EMAIL_THREAD_BODY_VIEW_MODES.length) return;
      const next = EMAIL_THREAD_BODY_VIEW_MODES[index]!;
      setBodyViewMode(next);
      rememberEmailThreadBodyViewMode(next);
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          title: "Email view",
        },
        onSelect,
      );
      return;
    }

    Alert.alert(
      "Email view",
      undefined,
      [
        ...EMAIL_THREAD_BODY_VIEW_MODES.map((mode) => ({
          text: EMAIL_THREAD_BODY_VIEW_MODE_LABELS[mode],
          onPress: () => onSelect(EMAIL_THREAD_BODY_VIEW_MODES.indexOf(mode)),
        })),
        { text: "Cancel", style: "cancel" },
      ],
    );
  }, [bodyViewMode]);

  const screenOptions = (
    <Stack.Screen
      options={{
        ...tabDetailScreenOptions({ embedded: isPadDevice() }),
        title: "",
        ...(inPadSplit ? { headerBackVisible: false } : null),
        ...(isPhone
          ? {
              headerRight: () => (
                <TabStackHeaderIconButton
                  accessibilityLabel="Email view mode"
                  chrome="plain"
                  onPress={showBodyViewModeMenu}
                >
                  <MoreHorizontalIcon size={18} color={colors.foreground} />
                </TabStackHeaderIconButton>
              ),
            }
          : null),
      }}
    />
  );

  if (!inboxId || !messageId) {
    return (
      <>
        {screenOptions}
        <View style={ui.centered}>
          <Text style={ui.empty}>Email not found.</Text>
        </View>
      </>
    );
  }

  if (loading && !detail) {
    return (
      <>
        {screenOptions}
        <View style={ui.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </>
    );
  }

  if (error || !detail) {
    return (
      <>
        {screenOptions}
        <View style={ui.centered}>
          <Text style={ui.error}>{error ?? "Could not load this email."}</Text>
        </View>
      </>
    );
  }

  const displayIdLabel =
    displayId ??
    detail.threadMetadata?.displayId ??
    detail.displayId ??
    (detail.threadMetadata?.number != null
      ? formatEmailDisplayId(detail.threadMetadata.number)
      : detail.number != null
        ? formatEmailDisplayId(detail.number)
        : null);
  const subject = detail.subject?.trim() || "(no subject)";
  const dueLabel = dueDate ? formatTaskDueMetaLabel(dueDate) : null;
  const organizationLabel = organizationId
    ? organizations.find((entry) => entry.id === organizationId)?.name?.trim() ||
      metadataNames.organizationName?.trim() ||
      detail.threadMetadata?.organizationName?.trim() ||
      detail.organizationName?.trim() ||
      null
    : null;
  const contactLabel = contactId
    ? contacts.find((entry) => entry.id === contactId)?.name?.trim() ||
      metadataNames.contactName?.trim() ||
      detail.threadMetadata?.contactName?.trim() ||
      detail.contactName?.trim() ||
      null
    : null;
  const assigneeLabel = assigneeId
    ? contacts.find((entry) => entry.id === assigneeId)?.name?.trim() ||
      metadataNames.assigneeName?.trim() ||
      detail.threadMetadata?.assigneeName?.trim() ||
      detail.assigneeName?.trim() ||
      null
    : null;
  const projectLabel = projectId
    ? projects.find((entry) => entry.id === projectId)?.name?.trim() ||
      metadataNames.projectName?.trim() ||
      detail.threadMetadata?.projectName?.trim() ||
      detail.projectName?.trim() ||
      null
    : null;

  const propertyRows = [
    {
      key: "status",
      label: "Status",
      value: getTaskStatusLabel(status),
      icon: <TaskStatusIcon status={status} size={16} />,
    },
    {
      key: "priority",
      label: "Priority",
      value: getTaskPriorityLabel(priority),
      icon: <TaskPriorityIcon priority={priority} size={16} />,
    },
    {
      key: "due",
      label: "Due date",
      value: dueLabel ?? "No due date",
      icon: <TaskDueDateIcon active={Boolean(dueLabel)} size={14} />,
    },
    {
      key: "organization",
      label: "Organization",
      value: organizationLabel || "No organization",
      icon: <OrganizationIcon size={14} />,
    },
    {
      key: "contact",
      label: "Contact",
      value: contactLabel || "No contact",
      icon: <ContactPersonIcon size={14} />,
    },
    {
      key: "assignee",
      label: "Assignee",
      value: assigneeLabel || "No assignee",
      icon: <ContactPersonIcon size={14} />,
    },
    {
      key: "project",
      label: "Project",
      value: projectLabel || "No project",
      icon: <ProjectIcon size={14} />,
    },
  ];

  const propertyChips = [
    {
      key: "status",
      label: getTaskStatusLabel(status),
      icon: <TaskStatusIcon status={status} size={14} />,
    },
    ...(priority > 0
      ? [
          {
            key: "priority",
            label: getTaskPriorityLabel(priority),
            icon: <TaskPriorityIcon priority={priority} size={14} />,
          },
        ]
      : []),
    ...(dueLabel
      ? [
          {
            key: "due",
            label: dueLabel,
            icon: <TaskDueDateIcon active size={12} />,
          },
        ]
      : []),
    ...(organizationLabel
      ? [
          {
            key: "organization",
            label: organizationLabel,
            icon: <OrganizationIcon size={12} />,
          },
        ]
      : []),
    ...(contactLabel
      ? [
          {
            key: "contact",
            label: contactLabel,
            icon: <ContactPersonIcon size={12} />,
          },
        ]
      : []),
    ...(assigneeLabel
      ? [
          {
            key: "assignee",
            label: assigneeLabel,
            icon: <ContactPersonIcon size={12} />,
          },
        ]
      : []),
    ...(projectLabel
      ? [
          {
            key: "project",
            label: projectLabel,
            icon: <ProjectIcon size={12} />,
          },
        ]
      : []),
  ];

  const propertySheets = (
    <>
      <PropertyOptionSheet
        embedded
        visible={picker === "status"}
        title="Status"
        options={statusOptions}
        selected={status}
        onSelect={(value) => {
          setStatus(value);
          setPicker(null);
          void patchMetadata({ status: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "priority"}
        title="Priority"
        options={priorityOptions}
        selected={priority}
        onSelect={(value) => {
          setPriority(value);
          setPicker(null);
          void patchMetadata({ priority: value });
        }}
        onClose={() => setPicker(null)}
      />
      <DueDatePropertySheet
        embedded
        visible={picker === "due"}
        selected={dueDate}
        onSelect={(value) => {
          setDueDate(value);
          setPicker(null);
          void patchMetadata({ dueDate: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "organization"}
        title="Organization"
        options={organizationOptions}
        selected={organizationId}
        onSelect={(value) => {
          setOrganizationId(value);
          // Keep the contact only when it belongs to the new organization.
          const keepContact =
            !value ||
            contacts.some(
              (entry) => entry.id === contactId && entry.organization_id === value,
            );
          if (!keepContact) setContactId(null);
          setPicker(null);
          const organizationName = value
            ? organizations.find((entry) => entry.id === value)?.name?.trim() ||
              null
            : null;
          void patchMetadata(
            {
              organizationId: value,
              ...(keepContact ? {} : { contactId: null }),
            },
            {
              organizationName,
              ...(keepContact ? {} : { contactName: null }),
            },
          );
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "contact"}
        title="Contact"
        options={contactOptions}
        selected={contactId}
        onSelect={(value) => {
          setContactId(value);
          setPicker(null);
          const contactName = value
            ? contacts.find((entry) => entry.id === value)?.name?.trim() || null
            : null;
          void patchMetadata({ contactId: value }, { contactName });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "assignee"}
        title="Assignee"
        options={assigneeOptions}
        selected={assigneeId}
        onSelect={(value) => {
          setAssigneeId(value);
          setPicker(null);
          const assigneeName = value
            ? contacts.find((entry) => entry.id === value)?.name?.trim() || null
            : null;
          void patchMetadata({ assigneeId: value }, { assigneeName });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "project"}
        title="Project"
        options={projectOptions}
        selected={projectId}
        onSelect={(value) => {
          setProjectId(value);
          setPicker(null);
          const project = value
            ? projects.find((entry) => entry.id === value) ?? null
            : null;
          void patchMetadata(
            { projectId: value },
            {
              projectName: project?.name?.trim() || null,
              projectKey: project?.key?.trim() || null,
            },
          );
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );

  return (
    <FeatureErrorBoundary title="Email thread">
      <>
      {screenOptions}
      <ScrollView
        style={ui.screen}
        contentContainerStyle={{
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
      >
        <View style={styles.header}>
          {displayIdLabel ? (
            <Text style={ui.detailId}>{displayIdLabel}</Text>
          ) : null}
          <Text style={styles.subject}>{subject}</Text>
        </View>

        <DetailPropertiesInlineShell
          modalTitle="Email properties"
          chips={propertyChips}
          overlay={propertySheets}
        >
          <DetailPropertyEditorRows
            rows={propertyRows}
            onPressRow={(key) => setPicker(key as PickerKind)}
          />
          {actionError ? (
            <Text style={[ui.error, { paddingTop: 8 }]}>{actionError}</Text>
          ) : null}
        </DetailPropertiesInlineShell>

        <View style={styles.messages}>
          {messages.map((message) => {
            const attachments = visibleEmailAttachments(message.attachments);
            const presentation = resolveEmailThreadMessagePresentation({
              from: message.from,
              to: message.to,
              inboxId: detail.inboxId,
              inboxEmail: detail.inboxEmail,
              contactId,
              contactName:
                metadataNames.contactName ??
                threadContact?.name ??
                detail.contactName,
              contactEmail: threadContact?.email ?? null,
              contactAvatarSrc: threadContactAvatarSrc,
              mailboxes,
              mailboxAvatarByContactId,
            });
            const messageAt = Date.parse(message.timestamp);
            const unreadFromHereIds = messages
              .filter((row) => {
                if (row.messageId === message.messageId) return true;
                const rowAt = Date.parse(row.timestamp);
                return (
                  Number.isFinite(messageAt) &&
                  Number.isFinite(rowAt) &&
                  rowAt >= messageAt
                );
              })
              .map((row) => row.messageId);
            const plainBody = emailMessagePlainBody(message);
            const messageSubject = message.subject?.trim() || subject;

            return (
              <EmailThreadMessageCard
                key={message.messageId}
                messageId={message.messageId}
                subject={messageSubject}
                from={message.from}
                to={presentation.toEmails}
                timestamp={message.timestamp}
                message={message}
                viewMode={bodyViewMode}
                loadSource={() =>
                  loadMessageSource(detail.inboxId, message.messageId)
                }
                isSent={presentation.isSent}
                partyAvatar={presentation.partyAvatar}
                fromLabel={presentation.fromLabel}
                fromEmail={presentation.fromEmail}
                toLabel={presentation.toLabel}
                attachments={attachments}
                downloadingAttachmentId={downloadingAttachmentId}
                onOpenAttachment={(attachment) => {
                  void onOpenAttachment(message, attachment);
                }}
                onReply={() =>
                  openReplyComposer(
                    message.messageId,
                    message.subject ?? detail.subject ?? "",
                    message.from,
                  )
                }
                onReplyAll={() =>
                  openReplyComposer(
                    detail.messageId,
                    detail.subject ?? "",
                    detail.from ?? "",
                  )
                }
                onCopyText={() => {
                  if (!plainBody) return;
                  void Share.share({ message: plainBody });
                }}
                onDelete={() => deleteThreadMessage(message.messageId)}
                onMarkUnreadFromHere={() =>
                  markMessagesUnread(unreadFromHereIds)
                }
                onReportSpam={() => reportSpamMessage(message.messageId)}
                onDownloadMessage={() => {
                  void downloadThreadMessage(message.messageId, messageSubject);
                }}
                onMessageInfo={() => {
                  Alert.alert(
                    "Message info",
                    [
                      `From: ${message.from}`,
                      `To: ${presentation.toEmails.join(", ") || "—"}`,
                      `Subject: ${messageSubject}`,
                      `Date: ${message.timestamp}`,
                      `Message ID: ${message.messageId}`,
                    ].join("\n\n"),
                  );
                }}
                actionsDisabled={busyAction != null}
              />
            );
          })}
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reply"
            onPress={onReply}
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionPrimary,
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <Text style={styles.actionPrimaryLabel}>Reply</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark unread"
            onPress={onMarkUnread}
            disabled={busyAction != null}
            style={({ pressed }) => [
              styles.actionButton,
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <Text style={styles.actionLabel}>
              {busyAction === "unread" ? "Marking…" : "Mark unread"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report spam"
            onPress={onReportSpam}
            disabled={busyAction != null}
            style={({ pressed }) => [
              styles.actionButton,
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <Text style={styles.actionDangerLabel}>
              {busyAction === "spam" ? "Reporting…" : "Report spam"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete"
            onPress={onDelete}
            disabled={busyAction != null}
            style={({ pressed }) => [
              styles.actionButton,
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <Text style={styles.actionDangerLabel}>
              {busyAction === "delete" ? "Deleting…" : "Delete"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      </>
    </FeatureErrorBoundary>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
  },
  subject: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 28,
  },
  messages: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  actionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionPrimary: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  actionPrimaryLabel: {
    color: colors.background,
    fontSize: 14,
    fontWeight: "600",
  },
  actionLabel: {
    color: colors.foreground,
    fontSize: 14,
  },
  actionDangerLabel: {
    color: "#da615d",
    fontSize: 14,
  },
});
