import type {
  Contact,
  Letter,
  LetterAttachment,
  Organization,
  Project,
} from "@backsteros/contracts";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  contactDetailHref,
  organizationDetailHref,
  projectDetailHref,
} from "../lib/detail-href";
import {
  asLetterTaskStatus,
  dueIsoForOffset,
  LETTER_CONTACTS_SQL,
  LETTER_DETAIL_EMPTY_SQL,
  LETTER_DETAIL_SQL,
  LETTER_ORGANIZATIONS_SQL,
  LETTER_PROJECTS_SQL,
  type LetterContactOptionRow,
  type LetterDetailRow,
  type LetterNamedOptionRow,
  type LetterPickerKind,
} from "../lib/letter-detail-model";
import { formatLetterDisplayId } from "../lib/letter-display-id";
import {
  pickLetterPdf,
  uploadLetterPdfFromUri,
} from "../lib/letter-pdf-upload";
import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { useHideTabBar } from "../lib/tab-bar-visibility";
import {
  TabStackHeaderTextButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { formatTaskDueMetaLabel } from "../lib/task-due-date";
import {
  getTaskStatusLabel,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { ContactPersonIcon } from "./contact-person-icon";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import {
  FLOATING_PDF_DOCK_CLEARANCE,
  FloatingComposeActionPill,
} from "./floating-compose-action-pill";
import { JournalMarkdownBody } from "./journal-markdown-body";
import { LetterFileChip } from "./letter-file-chip";
import { LetterPdfViewerModal } from "./letter-pdf-viewer-modal";
import { OrganizationIcon } from "./organization-icon";
import { ProjectIcon } from "./project-icon";
import { DueDatePropertySheet } from "./due-date-property-sheet";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskStatusIcon } from "./task-status-icon";
import { PlusIcon } from "./plus-icon";

type Props = {
  letterId: string | undefined;
};

type PropertyRow = {
  key: string;
  label: string;
  value: string;
  icon: ReactNode;
  navigateHref?: string | null;
  navigateLabel?: string;
};

type PickerKind = LetterPickerKind;
type NamedOptionRow = LetterNamedOptionRow;
type ContactOptionRow = LetterContactOptionRow;

/** Letter detail — title, editable properties, notes (`context`). */
export function LetterDetailScreen({ letterId }: Props) {
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();

  const detailSql = letterId ? LETTER_DETAIL_SQL : LETTER_DETAIL_EMPTY_SQL;
  const detailParams = useMemo(
    () => (letterId ? [letterId] : []),
    [letterId],
  );

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<LetterDetailRow>(detailSql, detailParams);
  const { data: syncedProjects } =
    useLocalQuery<NamedOptionRow>(LETTER_PROJECTS_SQL);
  const { data: syncedOrganizations } =
    useLocalQuery<NamedOptionRow>(LETTER_ORGANIZATIONS_SQL);
  const { data: syncedContacts } =
    useLocalQuery<ContactOptionRow>(LETTER_CONTACTS_SQL);

  const [restRow, setRestRow] = useState<LetterDetailRow | null>(null);
  const [restLoading, setRestLoading] = useState(false);
  const [restError, setRestError] = useState<string | null>(null);
  const [restProjects, setRestProjects] = useState<NamedOptionRow[]>([]);
  const [restOrganizations, setRestOrganizations] = useState<NamedOptionRow[]>(
    [],
  );
  const [restContacts, setRestContacts] = useState<ContactOptionRow[]>([]);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfAttachmentId, setPdfAttachmentId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<LetterAttachment[]>([]);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContext, setDraftContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [status, setStatus] = useState<TaskStatus>("triage");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [receivedDate, setReceivedDate] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);

  const local = syncedRows?.[0] ?? null;

  useEffect(() => {
    setPicker(null);
    setPropertyError(null);
    setEditing(false);
    setSaveError(null);
  }, [letterId]);

  useEffect(() => {
    if (!letterId) return;
    if (local) return;
    if (powerSync.ready && syncLoading) return;

    let cancelled = false;
    setRestLoading(true);
    setRestError(null);
    void client
      .requestJson<Letter>(
        `/api/v1/letters/${encodeURIComponent(letterId)}`,
      )
      .then(async (letter) => {
        if (cancelled) return;
        const [orgs, contacts, projects] = await Promise.all([
          letter.organizationId
            ? client
                .requestJson<{ organizations: Organization[] }>(
                  "/api/v1/organizations",
                )
                .catch(() => ({ organizations: [] as Organization[] }))
            : Promise.resolve({ organizations: [] as Organization[] }),
          letter.contactId
            ? client
                .requestJson<{ contacts: Contact[] }>("/api/v1/contacts")
                .catch(() => ({ contacts: [] as Contact[] }))
            : Promise.resolve({ contacts: [] as Contact[] }),
          letter.projectId
            ? client
                .requestJson<{ projects: Project[] }>("/api/v1/projects")
                .catch(() => ({ projects: [] as Project[] }))
            : Promise.resolve({ projects: [] as Project[] }),
        ]);
        if (cancelled) return;
        const organization = (orgs.organizations ?? []).find(
          (entry) => entry.id === letter.organizationId,
        );
        const contact = (contacts.contacts ?? []).find(
          (entry) => entry.id === letter.contactId,
        );
        const project = (projects.projects ?? []).find(
          (entry) => entry.id === letter.projectId,
        );
        setRestRow({
          id: letter.id,
          title: letter.title,
          number: letter.number,
          context: letter.context,
          status: letter.status,
          due_date: letter.dueDate,
          received_date: letter.receivedDate,
          organization_id: letter.organizationId,
          contact_id: letter.contactId,
          project_id: letter.projectId,
          storage_key: letter.storageKey,
          original_filename: letter.originalFilename,
          byte_size: letter.byteSize,
          organization_name: organization?.name ?? null,
          contact_name: contact?.name ?? null,
          project_name: project?.name ?? null,
          project_key: project?.key ?? null,
        });
      })
      .catch((reason) => {
        if (cancelled) return;
        setRestRow(null);
        setRestError(
          reason instanceof Error ? reason.message : String(reason),
        );
      })
      .finally(() => {
        if (!cancelled) setRestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, letterId, local, powerSync.ready, syncLoading]);

  useEffect(() => {
    if (powerSync.ready) return;
    let cancelled = false;
    void Promise.all([
      client
        .requestJson<{ projects: Project[] }>("/api/v1/projects")
        .then((body) =>
          (body.projects ?? []).map((project) => ({
            id: project.id,
            name: project.name,
          })),
        )
        .catch(() => [] as NamedOptionRow[]),
      client
        .requestJson<{ organizations: Organization[] }>(
          "/api/v1/organizations",
        )
        .then((body) =>
          (body.organizations ?? []).map((organization) => ({
            id: organization.id,
            name: organization.name,
          })),
        )
        .catch(() => [] as NamedOptionRow[]),
      client
        .requestJson<{ contacts: Contact[] }>("/api/v1/contacts")
        .then((body) =>
          (body.contacts ?? []).map((contact) => ({
            id: contact.id,
            name: contact.name,
            organization_id: contact.organizationId,
          })),
        )
        .catch(() => [] as ContactOptionRow[]),
    ]).then(([projects, organizations, contacts]) => {
      if (cancelled) return;
      setRestProjects(projects);
      setRestOrganizations(organizations);
      setRestContacts(contacts);
    });
    return () => {
      cancelled = true;
    };
  }, [client, powerSync.ready]);

  // Attachments may exist even when the legacy letter PDF fields are empty.
  const reloadAttachments = useCallback(async () => {
    if (!letterId) {
      setAttachments([]);
      return;
    }
    try {
      const { attachments: next } = await client.listLetterAttachments(letterId);
      setAttachments(next);
    } catch {
      setAttachments([]);
    }
  }, [client, letterId]);

  useEffect(() => {
    let cancelled = false;
    void reloadAttachments().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [reloadAttachments]);

  useHideTabBar(picking);

  const letter = local ?? restRow;
  const projects = powerSync.ready ? (syncedProjects ?? []) : restProjects;
  const organizations = powerSync.ready
    ? (syncedOrganizations ?? [])
    : restOrganizations;
  const contacts = powerSync.ready ? (syncedContacts ?? []) : restContacts;

  useEffect(() => {
    if (!letter) return;
    setStatus(asLetterTaskStatus(letter.status));
    setDueDate(letter.due_date);
    setReceivedDate(letter.received_date);
    setOrganizationId(letter.organization_id);
    setContactId(letter.contact_id);
    setProjectId(letter.project_id);
  }, [letter]);

  const startEditing = useCallback(() => {
    if (!letter) return;
    setDraftTitle(letter.title?.trim() || "");
    setDraftContext(letter.context ?? "");
    setSaveError(null);
    setPicker(null);
    setEditing(true);
  }, [letter]);


  async function saveEditing() {
    if (!letter || saving) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setSaveError("Title is required.");
      return;
    }
    const nextContext = draftContext.trim() || null;
    setSaving(true);
    setSaveError(null);
    try {
      if (powerSync.ready) {
        await powerSync.patchLetter(letter.id, {
          title: trimmedTitle,
          context: nextContext,
        });
        void client
          .requestJson<Letter>(
            `/api/v1/letters/${encodeURIComponent(letter.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                title: trimmedTitle,
                context: nextContext,
              }),
            },
          )
          .catch(() => {
            /* local already updated */
          });
      } else {
        await client.requestJson<Letter>(
          `/api/v1/letters/${encodeURIComponent(letter.id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: trimmedTitle,
              context: nextContext,
            }),
          },
        );
        setRestRow((prev) =>
          prev
            ? { ...prev, title: trimmedTitle, context: nextContext }
            : prev,
        );
      }
      setEditing(false);
      setDraftTitle("");
      setDraftContext("");
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : "Could not save letter.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function patchProperty(values: Record<string, unknown>) {
    if (!letter) return;
    setPropertyError(null);
    const sqliteValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (key === "dueDate") sqliteValues.due_date = value;
      else if (key === "receivedDate") sqliteValues.received_date = value;
      else if (key === "organizationId") sqliteValues.organization_id = value;
      else if (key === "contactId") sqliteValues.contact_id = value;
      else if (key === "projectId") sqliteValues.project_id = value;
      else sqliteValues[key] = value;
    }
    try {
      if (powerSync.ready) {
        await powerSync.patchLetter(letter.id, sqliteValues);
        void client
          .requestJson<Letter>(
            `/api/v1/letters/${encodeURIComponent(letter.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(values),
            },
          )
          .catch(() => {
            /* local already updated */
          });
      } else {
        await client.requestJson<Letter>(
          `/api/v1/letters/${encodeURIComponent(letter.id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(values),
          },
        );
        setRestRow((prev) =>
          prev
            ? {
                ...prev,
                ...(sqliteValues.status !== undefined
                  ? { status: String(sqliteValues.status) }
                  : {}),
                ...(sqliteValues.due_date !== undefined
                  ? { due_date: sqliteValues.due_date as string | null }
                  : {}),
                ...(sqliteValues.received_date !== undefined
                  ? {
                      received_date: sqliteValues.received_date as
                        | string
                        | null,
                    }
                  : {}),
                ...(sqliteValues.organization_id !== undefined
                  ? {
                      organization_id: sqliteValues.organization_id as
                        | string
                        | null,
                      organization_name:
                        sqliteValues.organization_id == null
                          ? null
                          : (organizations.find(
                              (entry) =>
                                entry.id === sqliteValues.organization_id,
                            )?.name ?? prev.organization_name),
                    }
                  : {}),
                ...(sqliteValues.contact_id !== undefined
                  ? {
                      contact_id: sqliteValues.contact_id as string | null,
                      contact_name:
                        sqliteValues.contact_id == null
                          ? null
                          : (contacts.find(
                              (entry) => entry.id === sqliteValues.contact_id,
                            )?.name ?? prev.contact_name),
                    }
                  : {}),
                ...(sqliteValues.project_id !== undefined
                  ? {
                      project_id: sqliteValues.project_id as string | null,
                      project_name:
                        sqliteValues.project_id == null
                          ? null
                          : (projects.find(
                              (entry) => entry.id === sqliteValues.project_id,
                            )?.name ?? prev.project_name),
                    }
                  : {}),
              }
            : prev,
        );
      }
    } catch (reason) {
      setPropertyError(
        reason instanceof Error
          ? reason.message
          : "Could not update property.",
      );
    }
  }

  const statusOptions = useMemo<PropertyOption<TaskStatus>[]>(
    () =>
      TASK_STATUS_ORDER.map((value) => ({
        value,
        label: getTaskStatusLabel(value),
        icon: <TaskStatusIcon status={value} size={16} />,
      })),
    [],
  );

  const dateOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No date",
        icon: <TaskDueDateIcon active={false} size={14} />,
      },
      {
        value: dueIsoForOffset(0),
        label: "Today",
        icon: <TaskDueDateIcon active size={14} />,
      },
      {
        value: dueIsoForOffset(1),
        label: "Tomorrow",
        icon: <TaskDueDateIcon active size={14} />,
      },
      {
        value: dueIsoForOffset(7),
        label: "In 7 days",
        icon: <TaskDueDateIcon active size={14} />,
      },
    ],
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
        icon: <OrganizationIcon size={14} color={colors.foreground} />,
      })),
    ],
    [organizations],
  );

  const filteredContacts = useMemo(
    () =>
      organizationId
        ? contacts.filter(
            (contact) => contact.organization_id === organizationId,
          )
        : [],
    [contacts, organizationId],
  );

  const contactOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No contact",
        icon: <ContactPersonIcon size={14} />,
      },
      ...filteredContacts.map((contact) => ({
        value: contact.id,
        label: contact.name?.trim() || "Untitled",
        icon: <ContactPersonIcon size={14} color={colors.foreground} />,
      })),
    ],
    [filteredContacts],
  );

  const projectOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No project",
        icon: <ProjectIcon size={14} />,
      },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name?.trim() || "Untitled",
        icon: <ProjectIcon size={14} color={colors.foreground} />,
      })),
    ],
    [projects],
  );

  const loading =
    !letter && (powerSync.ready ? syncLoading : restLoading);
  const hasLegacyPdf = Boolean(
    letter?.storage_key && (letter.byte_size ?? 0) > 0,
  );
  const hasPdf = hasLegacyPdf || attachments.length > 0;

  async function onUploadPdf() {
    if (!letterId || picking || uploading) return;
    setPicking(true);
    setUploadError(null);
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      const picked = await pickLetterPdf();
      if (!picked) return;
      setUploading(true);
      const upload = await uploadLetterPdfFromUri(
        client,
        letterId,
        picked.uri,
        picked.name,
      );
      if (!upload.ok) {
        setUploadError(upload.error);
        return;
      }
      await reloadAttachments();
    } catch (reason) {
      setUploadError(
        reason instanceof Error ? reason.message : "Could not upload PDF.",
      );
    } finally {
      setPicking(false);
      setUploading(false);
    }
  }

  function openPdf(attachmentId: string | null = null) {
    setPdfAttachmentId(attachmentId);
    setPdfOpen(true);
  }

  async function renameAttachment(
    attachmentId: string,
    nextFilename: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!letterId) {
      return { ok: false, error: "Letter is required." };
    }
    try {
      await client.updateLetterAttachment(letterId, attachmentId, {
        originalFilename: nextFilename,
      });
      await reloadAttachments();
      return { ok: true };
    } catch (reason) {
      return {
        ok: false,
        error:
          reason instanceof Error ? reason.message : "Could not rename PDF.",
      };
    }
  }

  async function renameLegacyPdf(
    nextFilename: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!letter) {
      return { ok: false, error: "Letter is required." };
    }
    try {
      if (powerSync.ready) {
        await powerSync.patchLetter(letter.id, {
          original_filename: nextFilename,
        });
      }
      await client.requestJson<Letter>(
        `/api/v1/letters/${encodeURIComponent(letter.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ originalFilename: nextFilename }),
        },
      );
      setRestRow((prev) =>
        prev && prev.id === letter.id
          ? { ...prev, original_filename: nextFilename }
          : prev,
      );
      return { ok: true };
    } catch (reason) {
      return {
        ok: false,
        error:
          reason instanceof Error ? reason.message : "Could not rename PDF.",
      };
    }
  }

  async function deleteAttachment(
    attachmentId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!letterId) {
      return { ok: false, error: "Letter is required." };
    }
    try {
      await client.deleteLetterAttachment(letterId, attachmentId);
      if (pdfAttachmentId === attachmentId) {
        setPdfOpen(false);
        setPdfAttachmentId(null);
      }
      await reloadAttachments();
      return { ok: true };
    } catch (reason) {
      return {
        ok: false,
        error:
          reason instanceof Error ? reason.message : "Could not delete PDF.",
      };
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: "" }} />
        <View style={ui.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </>
    );
  }

  if (!letter) {
    return (
      <>
        <Stack.Screen options={{ title: "" }} />
        <View style={ui.screen}>
          <Text style={ui.error}>{restError ?? "Letter not found."}</Text>
        </View>
      </>
    );
  }

  const title = letter.title?.trim() || "Letter";
  const body = (letter.context ?? "").trim();
  const displayId =
    letter.number != null ? formatLetterDisplayId(letter.number) : null;
  const receivedLabel = formatTaskDueMetaLabel(receivedDate);
  const dueLabel = formatTaskDueMetaLabel(dueDate);

  const selectedOrganization = organizations.find(
    (entry) => entry.id === organizationId,
  );
  const selectedContact = contacts.find((entry) => entry.id === contactId);
  const selectedProject = projects.find((entry) => entry.id === projectId);
  const organizationLabel =
    selectedOrganization?.name?.trim() ||
    letter.organization_name?.trim() ||
    null;
  const contactLabel =
    selectedContact?.name?.trim() || letter.contact_name?.trim() || null;
  const projectLabel =
    selectedProject?.name?.trim() || letter.project_name?.trim() || null;

  const allPropertyRows: PropertyRow[] = [
    {
      key: "organization",
      label: "Organization",
      value: organizationLabel || "No organization",
      icon: <OrganizationIcon size={14} />,
      navigateHref: organizationId
        ? organizationDetailHref(organizationId)
        : null,
      navigateLabel: "Open organization",
    },
    {
      key: "contact",
      label: "Contact",
      value: contactLabel || "No contact",
      icon: <ContactPersonIcon size={14} />,
      navigateHref: contactId ? contactDetailHref(contactId) : null,
      navigateLabel: "Open contact",
    },
    {
      key: "received",
      label: "Received",
      value: receivedLabel ?? "—",
      icon: <TaskDueDateIcon active={Boolean(receivedLabel)} size={14} />,
    },
    {
      key: "status",
      label: "Status",
      value: getTaskStatusLabel(status),
      icon: <TaskStatusIcon status={status} size={16} />,
    },
    {
      key: "due",
      label: "Due date",
      value: dueLabel ?? "No due date",
      icon: <TaskDueDateIcon active={Boolean(dueLabel)} size={14} />,
    },
    {
      key: "project",
      label: "Project",
      value: projectLabel || "No project",
      icon: <ProjectIcon size={14} />,
      navigateHref: projectId ? projectDetailHref(projectId) : null,
      navigateLabel: projectLabel
        ? `Open ${projectLabel}`
        : "Open project",
    },
  ];

  const propertyChips = [
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
    {
      key: "status",
      label: getTaskStatusLabel(status),
      icon: <TaskStatusIcon status={status} size={14} />,
    },
    ...(receivedLabel
      ? [
          {
            key: "received",
            label: receivedLabel,
            icon: <TaskDueDateIcon active size={12} />,
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
        visible={picker === "organization"}
        title="Organization"
        options={organizationOptions}
        selected={organizationId}
        onSelect={(value) => {
          setOrganizationId(value);
          setContactId(null);
          setPicker(null);
          void patchProperty({
            organizationId: value,
            contactId: null,
          });
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
          void patchProperty({ contactId: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "received"}
        title="Received"
        options={dateOptions}
        selected={receivedDate}
        onSelect={(value) => {
          setReceivedDate(value);
          setPicker(null);
          void patchProperty({ receivedDate: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "status"}
        title="Status"
        options={statusOptions}
        selected={status}
        onSelect={(value) => {
          setStatus(value);
          setPicker(null);
          void patchProperty({ status: value });
        }}
        onClose={() => setPicker(null)}
      />
      <DueDatePropertySheet
        embedded
        visible={picker === "due"}
        title="Due date"
        selected={dueDate}
        onSelect={(value) => {
          setDueDate(value);
          setPicker(null);
          void patchProperty({ dueDate: value });
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
          void patchProperty({ projectId: value });
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          title: "",
          headerRight: () =>
            editing ? (
              <TabStackHeaderTextButton
                label="Save"
                onPress={() => {
                  void saveEditing();
                }}
                loading={saving}
                disabled={saving || !draftTitle.trim()}
              />
            ) : (
              <TabStackHeaderTextButton
                label="Edit"
                onPress={startEditing}
              />
            ),
        }}
      />
      {editing ? (
        <ScrollView
          style={ui.screen}
          contentContainerStyle={{
            paddingBottom:
              FLOATING_TAB_BAR_CLEARANCE + FLOATING_PDF_DOCK_CLEARANCE,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
            {displayId ? (
              <Text style={ui.detailId}>{displayId}</Text>
            ) : null}
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
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
              value={draftContext}
              onChangeText={setDraftContext}
              placeholder="Add notes…"
              placeholderTextColor={colors.muted}
              multiline
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
          {saveError ? (
            <Text style={[ui.error, { paddingHorizontal: 16 }]}>
              {saveError}
            </Text>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView
          style={ui.screen}
          contentContainerStyle={{
            paddingBottom:
              FLOATING_TAB_BAR_CLEARANCE + FLOATING_PDF_DOCK_CLEARANCE,
          }}
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 6 }}>
            {displayId ? (
              <Text style={ui.detailId}>{displayId}</Text>
            ) : null}
            <Text style={ui.detailTitle}>{title}</Text>
          </View>

          <DetailPropertiesInlineShell
            modalTitle="Letter properties"
            chips={propertyChips}
            overlay={propertySheets}
          >
            <DetailPropertyEditorRows
              rows={allPropertyRows}
              onPressRow={(key) => {
                if (key === "contact" && !organizationId) return;
                setPicker(key as PickerKind);
              }}
            />
            {propertyError ? (
              <Text style={[ui.error, { paddingTop: 8 }]}>
                {propertyError}
              </Text>
            ) : null}
          </DetailPropertiesInlineShell>

          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            {body ? (
              <JournalMarkdownBody body={body} />
            ) : (
              <Text style={ui.rowMeta}>No notes yet.</Text>
            )}
          </View>
        </ScrollView>
      )}

      {uploadError ? (
        <Text
          style={[
            ui.error,
            { paddingHorizontal: 16, paddingBottom: 8 },
          ]}
        >
          {uploadError}
        </Text>
      ) : null}

      <FloatingComposeActionPill
        onPress={() => {
          void onUploadPdf();
        }}
        disabled={picking || uploading}
        accessibilityLabel="Upload PDF"
        left={
          attachments.length > 0 || hasLegacyPdf ? (
            <>
              {attachments.map((attachment) => (
                <LetterFileChip
                  key={attachment.id}
                  filename={attachment.originalFilename}
                  onPress={() => openPdf(attachment.id)}
                  onRename={(nextFilename) =>
                    renameAttachment(attachment.id, nextFilename)
                  }
                  onDelete={() => deleteAttachment(attachment.id)}
                  disabled={picking || uploading}
                  active={pdfOpen && pdfAttachmentId === attachment.id}
                />
              ))}
              {hasLegacyPdf && attachments.length === 0 ? (
                <LetterFileChip
                  filename={
                    letter.original_filename?.trim() || "Document.pdf"
                  }
                  onPress={() => openPdf(null)}
                  onRename={renameLegacyPdf}
                  disabled={picking || uploading}
                  active={pdfOpen && pdfAttachmentId == null}
                />
              ) : null}
            </>
          ) : undefined
        }
      >
        {picking || uploading ? (
          <ActivityIndicator color={colors.foreground} size="small" />
        ) : (
          <PlusIcon size={22} color={colors.foreground} />
        )}
      </FloatingComposeActionPill>

      {letterId && hasPdf ? (
        <LetterPdfViewerModal
          visible={pdfOpen}
          letterId={letterId}
          attachmentId={pdfAttachmentId}
          client={client}
          onClose={() => {
            setPdfOpen(false);
            setPdfAttachmentId(null);
          }}
        />
      ) : null}
    </>
  );
}
