import type { Meeting } from "@backsteros/contracts";
import {
  trackedMinutesFromMeetingSchedule,
} from "@backsteros/contracts";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { AttendeesPropertySheet } from "./attendees-property-sheet";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { MeetingDateTimePropertySheet } from "./meeting-datetime-property-sheet";
import { OrganizationIcon } from "./organization-icon";
import { PillNav } from "./pill-nav";
import { ProjectOcticon } from "./project-octicon";
import { PropertyOptionSheet, type PropertyOption } from "./property-option-sheet";
import { TaskStatusIcon } from "./task-status-icon";
import { TrackedTimeField } from "./tracked-time-field";
import { TextInput } from "./app-text-input";

import { formatMeetingDisplayId } from "../lib/meeting-display-id";
import { meetingDetailHref } from "../lib/detail-href";
import { patchMeetingViaPowerSyncOrApi } from "../lib/meeting-mutations";
import {
  MEETING_CONTACTS_SQL,
  MEETING_DETAIL_EMPTY_SQL,
  MEETING_DETAIL_SQL,
  MEETING_ORGANIZATIONS_SQL,
  MEETING_PROJECTS_SQL,
  parseAttendeeContactIds,
  serializeAttendeeContactIds,
  type MeetingContactOptionRow,
  type MeetingDetailRow,
  type MeetingNamedOptionRow,
} from "../lib/meeting-detail-model";
import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import {
  getTaskStatusLabel,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";

type Props = {
  meetingId: string | undefined;
};

function formatMeetingInstant(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMeetingWhen(startAt: string | null, endAt: string | null): string {
  if (!startAt) return "—";
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return startAt;
  const datePart = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timePart = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endAt) return `${datePart} · ${timePart}`;
  const end = new Date(endAt);
  if (Number.isNaN(end.getTime())) return `${datePart} · ${timePart}`;
  const endPart = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart} – ${endPart}`;
}

type ContentTab = "summary" | "notes" | "transcription";

const CONTENT_TABS: { id: ContentTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "notes", label: "Notes" },
  { id: "transcription", label: "Transcription" },
];

type PickerKind =
  | "status"
  | "project"
  | "organization"
  | "start"
  | "end"
  | "attendees"
  | null;

/** Meeting detail — title, schedule, properties, summary/notes. */
export function MeetingDetailScreen({ meetingId }: Props) {
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();

  const detailSql = meetingId ? MEETING_DETAIL_SQL : MEETING_DETAIL_EMPTY_SQL;
  const detailParams = useMemo(
    () => (meetingId ? [meetingId] : []),
    [meetingId],
  );

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<MeetingDetailRow>(detailSql, detailParams);
  const { data: syncedProjects } =
    useLocalQuery<MeetingNamedOptionRow>(MEETING_PROJECTS_SQL);
  const { data: syncedOrganizations } =
    useLocalQuery<MeetingNamedOptionRow>(MEETING_ORGANIZATIONS_SQL);
  const { data: syncedContacts } =
    useLocalQuery<MeetingContactOptionRow>(MEETING_CONTACTS_SQL);

  const [restMeeting, setRestMeeting] = useState<Meeting | null>(null);
  const [restLoading, setRestLoading] = useState(false);
  const [restError, setRestError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTranscription, setDraftTranscription] = useState("");
  const [contentTab, setContentTab] = useState<ContentTab>("summary");
  const [picker, setPicker] = useState<PickerKind>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const localRow = syncedRows[0] ?? null;
  const row = localRow ?? restMeeting;

  useEffect(() => {
    if (!meetingId || localRow || !powerSync.ready) return;
    let cancelled = false;
    setRestLoading(true);
    setRestError(null);
    void client
      .requestJson<Meeting>(`/api/v1/meetings/${encodeURIComponent(meetingId)}`)
      .then((meeting) => {
        if (!cancelled) setRestMeeting(meeting);
      })
      .catch((err) => {
        if (!cancelled) {
          setRestError(
            err instanceof Error ? err.message : "Could not load meeting.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setRestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, localRow, meetingId, powerSync.ready]);

  useEffect(() => {
    if (!row) return;
    setDraftTitle(row.title?.trim() || "");
    setDraftSummary(
      ("summary" in row ? row.summary : null)?.trim?.() ??
        localRow?.summary?.trim() ??
        "",
    );
    setDraftNotes(
      ("notes" in row ? row.notes : null)?.trim?.() ??
        localRow?.notes?.trim() ??
        "",
    );
    setDraftTranscription(
      ("transcription" in row ? row.transcription : null)?.trim?.() ??
        localRow?.transcription?.trim() ??
        "",
    );
  }, [localRow?.notes, localRow?.summary, localRow?.transcription, row]);

  const displayId = formatMeetingDisplayId(
    localRow?.number ?? restMeeting?.number ?? null,
  );

  const status =
    (localRow?.status ?? restMeeting?.status ?? "backlog") as TaskStatus;

  const projectId = localRow?.project_id ?? restMeeting?.projectId ?? null;
  const organizationId =
    localRow?.organization_id ?? restMeeting?.organizationId ?? null;

  const projectLabel =
    localRow?.project_name?.trim() ||
    localRow?.project_key?.trim() ||
    syncedProjects.find((p) => p.id === projectId)?.name?.trim() ||
    "No project";

  const organizationLabel =
    localRow?.organization_name?.trim() ||
    syncedOrganizations.find((o) => o.id === organizationId)?.name?.trim() ||
    "No organization";

  const attendeeIds = useMemo(() => {
    if (localRow?.attendee_contact_ids) {
      return parseAttendeeContactIds(localRow.attendee_contact_ids);
    }
    return restMeeting?.attendeeContactIds ?? [];
  }, [localRow?.attendee_contact_ids, restMeeting?.attendeeContactIds]);

  const attendeeLabel =
    attendeeIds.length === 0
      ? "No attendees"
      : attendeeIds
          .map((id) => syncedContacts.find((c) => c.id === id)?.name?.trim())
          .filter(Boolean)
          .join(", ") || `${attendeeIds.length} attendees`;

  const startAt = localRow?.start_at ?? restMeeting?.startAt ?? null;
  const endAt = localRow?.end_at ?? restMeeting?.endAt ?? null;

  const attendeeOptions = useMemo(
    () =>
      syncedContacts.map((contact) => ({
        id: contact.id,
        label: contact.name?.trim() || contact.email?.trim() || "Contact",
      })),
    [syncedContacts],
  );

  const patchMeeting = useCallback(
    async (values: Record<string, unknown>) => {
      if (!meetingId) return;
      setSaveError(null);
      try {
        await patchMeetingViaPowerSyncOrApi(
          client,
          powerSync,
          meetingId,
          values,
        );
      } catch (err) {
        setSaveError(
          err instanceof Error ? err.message : "Could not save meeting.",
        );
      }
    },
    [client, meetingId, powerSync],
  );

  const saveTitle = useCallback(async () => {
    const title = draftTitle.trim();
    if (!title || title === row?.title?.trim()) return;
    await patchMeeting({ title });
  }, [draftTitle, patchMeeting, row?.title]);

  const saveSummary = useCallback(async () => {
    const summary = draftSummary.trim() || null;
    const current = localRow?.summary ?? restMeeting?.summary ?? null;
    if ((summary ?? "") === (current?.trim() ?? "")) return;
    await patchMeeting({ summary });
  }, [draftSummary, localRow?.summary, patchMeeting, restMeeting?.summary]);

  const saveNotes = useCallback(async () => {
    const notes = draftNotes.trim() || null;
    const current = localRow?.notes ?? restMeeting?.notes ?? null;
    if ((notes ?? "") === (current?.trim() ?? "")) return;
    await patchMeeting({ notes });
  }, [draftNotes, localRow?.notes, patchMeeting, restMeeting?.notes]);

  const saveTranscription = useCallback(async () => {
    const transcription = draftTranscription.trim() || null;
    const current =
      localRow?.transcription ?? restMeeting?.transcription ?? null;
    if ((transcription ?? "") === (current?.trim() ?? "")) return;
    await patchMeeting({ transcription });
  }, [
    draftTranscription,
    localRow?.transcription,
    patchMeeting,
    restMeeting?.transcription,
  ]);

  const statusOptions = useMemo<PropertyOption<TaskStatus>[]>(
    () =>
      TASK_STATUS_ORDER.map((value) => ({
        value,
        label: getTaskStatusLabel(value),
        icon: <TaskStatusIcon status={value} size={16} />,
      })),
    [],
  );

  const projectOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      { value: null, label: "No project" },
      ...syncedProjects.map((project) => ({
        value: project.id,
        label: project.name?.trim() || project.key?.trim() || "Project",
        icon: (
          <ProjectOcticon
            size={16}
            color={colors.muted}
            icon={project.icon}
            type={project.type}
          />
        ),
      })),
    ],
    [syncedProjects],
  );

  const organizationOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      { value: null, label: "No organization" },
      ...syncedOrganizations.map((org) => ({
        value: org.id,
        label: org.name?.trim() || org.key?.trim() || "Organization",
        icon: <OrganizationIcon size={16} color={colors.muted} />,
      })),
    ],
    [syncedOrganizations],
  );

  const propertyChips: { key: string; label: string; value: string }[] = [
    { key: "status", label: "Status", value: getTaskStatusLabel(status) },
    { key: "project", label: "Project", value: projectLabel },
    { key: "organization", label: "Organization", value: organizationLabel },
    { key: "attendees", label: "Attendees", value: attendeeLabel },
    {
      key: "when",
      label: "When",
      value: formatMeetingWhen(startAt, endAt),
    },
  ];

  const propertyEditor = (
    <DetailPropertyEditorRows
      rows={[
        {
          key: "status",
          label: "Status",
          value: getTaskStatusLabel(status),
          icon: <TaskStatusIcon status={status} size={16} />,
        },
        {
          key: "project",
          label: "Project",
          value: projectLabel,
          icon: (
            <ProjectOcticon
              size={16}
              color={colors.muted}
              icon={localRow?.project_icon}
              type={localRow?.project_type}
            />
          ),
        },
        {
          key: "organization",
          label: "Organization",
          value: organizationLabel,
          icon: <OrganizationIcon size={16} color={colors.muted} />,
        },
        {
          key: "attendees",
          label: "Attendees",
          value: attendeeLabel,
        },
        {
          key: "start",
          label: "Starts",
          value: formatMeetingInstant(startAt),
        },
        {
          key: "end",
          label: "Ends",
          value: formatMeetingInstant(endAt),
        },
      ]}
      onPressRow={(key) => {
        if (key === "when") {
          setPicker("start");
          return;
        }
        setPicker(key as PickerKind);
      }}
    />
  );

  const propertySheets = (
    <>
      <PropertyOptionSheet
        visible={picker === "status"}
        title="Status"
        options={statusOptions}
        selected={status}
        onSelect={(value) => {
          setPicker(null);
          void patchMeeting({ status: value as TaskStatus });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        visible={picker === "project"}
        title="Project"
        options={projectOptions}
        selected={projectId}
        onSelect={(value) => {
          setPicker(null);
          void patchMeeting({ projectId: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        visible={picker === "organization"}
        title="Organization"
        options={organizationOptions}
        selected={organizationId}
        onSelect={(value) => {
          setPicker(null);
          void patchMeeting({ organizationId: value });
        }}
        onClose={() => setPicker(null)}
      />
      <MeetingDateTimePropertySheet
        visible={picker === "start"}
        title="Starts"
        value={startAt}
        onSelect={(iso) => {
          void patchMeeting({ startAt: iso });
        }}
        onClose={() => setPicker(null)}
      />
      <MeetingDateTimePropertySheet
        visible={picker === "end"}
        title="Ends"
        value={endAt}
        onSelect={(iso) => {
          void patchMeeting({ endAt: iso });
        }}
        onClose={() => setPicker(null)}
      />
      <AttendeesPropertySheet
        visible={picker === "attendees"}
        searchPlaceholder="Search contacts…"
        options={attendeeOptions}
        selectedIds={attendeeIds}
        onChange={(ids) => {
          void patchMeeting({
            attendeeContactIds: serializeAttendeeContactIds(ids),
          });
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );

  if (!meetingId) {
    return (
      <View style={ui.screen}>
        <Text style={ui.body}>Meeting not found.</Text>
      </View>
    );
  }

  if ((syncLoading || restLoading) && !row) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!row) {
    return (
      <View style={ui.screen}>
        <Text style={ui.error}>{restError ?? "Meeting not found."}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <KeyboardAwareScrollView
        style={ui.screen}
        bottomClearance={FLOATING_TAB_BAR_CLEARANCE}
        keepEndVisibleWhileTyping
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        <Text style={ui.detailId}>{displayId}</Text>
        <TextInput
          value={draftTitle}
          onChangeText={setDraftTitle}
          onBlur={() => void saveTitle()}
          placeholder="Meeting title"
          style={ui.detailTitle}
        />
        </View>

        <DetailPropertiesInlineShell
          modalTitle="Meeting properties"
          chips={propertyChips}
          overlay={propertySheets}
        >
          {propertyEditor}
        </DetailPropertiesInlineShell>

        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <TrackedTimeField
            variant="pill"
            trackedDurationSeconds={
              localRow?.tracked_duration_seconds ??
              restMeeting?.trackedDurationSeconds ??
              null
            }
            trackedMinutes={
              localRow?.tracked_minutes ?? restMeeting?.trackedMinutes ?? null
            }
            scheduleMinutes={trackedMinutesFromMeetingSchedule(startAt, endAt)}
            timerSession={{
              kind: "meeting",
              entityId: meetingId,
              title: draftTitle.trim() || row.title?.trim() || "Untitled meeting",
              subtitle: displayId,
              statusKey: status,
              href: meetingDetailHref(meetingId),
            }}
            onTrackedDurationSecondsChange={(seconds) => {
              void patchMeeting({ trackedDurationSeconds: seconds });
            }}
          />
        </View>

        <View style={{ marginTop: 16, gap: 12, paddingHorizontal: 16 }}>
          <PillNav
            accessibilityLabel="Meeting content"
            value={contentTab}
            onChange={setContentTab}
            align="start"
            items={CONTENT_TABS.map((tab) => ({
              value: tab.id,
              label: tab.label,
            }))}
          />
          {contentTab === "summary" ? (
            <>
              <Text style={ui.propertyLabel}>Summary</Text>
              <TextInput
                value={draftSummary}
                onChangeText={setDraftSummary}
                onBlur={() => void saveSummary()}
                placeholder="Summary"
                multiline
                style={{ minHeight: 80, color: colors.foreground }}
              />
            </>
          ) : null}
          {contentTab === "notes" ? (
            <>
              <Text style={ui.propertyLabel}>Notes</Text>
              <TextInput
                value={draftNotes}
                onChangeText={setDraftNotes}
                onBlur={() => void saveNotes()}
                placeholder="Notes"
                multiline
                style={{ minHeight: 120, color: colors.foreground }}
              />
            </>
          ) : null}
          {contentTab === "transcription" ? (
            <>
              <Text style={ui.propertyLabel}>Transcription</Text>
              <TextInput
                value={draftTranscription}
                onChangeText={setDraftTranscription}
                onBlur={() => void saveTranscription()}
                placeholder="Meeting transcription"
                multiline
                style={{ minHeight: 160, color: colors.foreground }}
              />
            </>
          ) : null}
        </View>

        {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
      </KeyboardAwareScrollView>
    </>
  );
}
