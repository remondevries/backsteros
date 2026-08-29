import { useMemo } from "react";

import {
  buildAssigneeDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  type MeetingDetailViewProps,
  type MeetingFormat,
  type MeetingListItem,
  type MeetingPropertiesMeeting,
} from "@backsteros/ui";

import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "./avatar-src";
import type { DesktopWorkspaceData } from "./workspace/workspace-data-types";

export { parseMeetingAttendeeContactIdsFromRow } from "./workspace/row-mappers";

type Workspace = DesktopWorkspaceData;

export function useMeetingDetailViewProps(
  meeting: MeetingListItem | null | undefined,
  workspace: Workspace,
  patchMeeting: (values: Record<string, unknown>) => void,
): Pick<
  MeetingDetailViewProps,
  | "meeting"
  | "format"
  | "onFormatChange"
  | "onStatusChange"
  | "onStartChange"
  | "onEndChange"
  | "onProjectChange"
  | "onOrganizationChange"
  | "onAttendeeContactIdsChange"
  | "onTrackedDurationSecondsChange"
  | "timerSession"
  | "organizationOptions"
  | "contactOptions"
  | "projectOptions"
> {
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    workspace.organizations,
  );

  const organizationOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        withAvatarSrc(workspace.organizations, organizationAvatarSrc).map(
          (org) => ({
            id: org.id,
            name: org.name,
            avatarSrc: org.avatarSrc,
          }),
        ),
      ),
    [organizationAvatarSrc, workspace.organizations],
  );

  const contactOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(workspace.contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, workspace.contacts],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        workspace.projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
        })),
      ),
    [workspace.projects],
  );

  const meetingProperties = useMemo((): MeetingPropertiesMeeting | null => {
    if (!meeting) return null;
    const startAt = new Date(meeting.startAt);
    const endAt = new Date(meeting.endAt);
    const project = meeting.projectId
      ? workspace.projects.find((entry) => entry.id === meeting.projectId)
      : null;
    const organization = meeting.organizationId
      ? workspace.organizations.find(
          (entry) => entry.id === meeting.organizationId,
        )
      : null;
    return {
      status: meeting.status ?? "ready_to_start",
      startAt: Number.isNaN(startAt.getTime()) ? null : startAt,
      endAt: Number.isNaN(endAt.getTime()) ? null : endAt,
      projectKey: project?.key ?? null,
      projectName: project?.name ?? null,
      organizationId: meeting.organizationId ?? null,
      organizationName: organization?.name ?? null,
      attendeeContactIds: meeting.attendeeContactIds ?? [],
      trackedMinutes: meeting.trackedMinutes ?? null,
      trackedDurationSeconds: meeting.trackedDurationSeconds ?? null,
    };
  }, [meeting, workspace.organizations, workspace.projects]);

  return {
    meeting: meetingProperties,
    format: meeting?.format ?? "video_call",
    onFormatChange: (next: MeetingFormat) => patchMeeting({ format: next }),
    onStatusChange: (status) => patchMeeting({ status }),
    onStartChange: (value) => {
      if (!value) return;
      patchMeeting({ startAt: value.toISOString() });
    },
    onEndChange: (value) => {
      if (!value) return;
      patchMeeting({ endAt: value.toISOString() });
    },
    onProjectChange: (projectKey) => {
      const project = projectKey
        ? workspace.projects.find((entry) => entry.key === projectKey)
        : null;
      patchMeeting({ projectId: project?.id ?? null });
    },
    onOrganizationChange: (organizationId) => {
      patchMeeting({ organizationId });
    },
    onAttendeeContactIdsChange: (contactIds) => {
      patchMeeting({ attendeeContactIds: contactIds });
    },
    onTrackedDurationSecondsChange: (seconds) => {
      const trackedMinutes =
        seconds != null && seconds >= 60 ? Math.floor(seconds / 60) : null;
      patchMeeting({
        trackedDurationSeconds: seconds,
        trackedMinutes,
      });
    },
    timerSession: meeting
      ? {
          kind: "meeting" as const,
          entityId: meeting.id,
          title: meeting.title,
          subtitle: meeting.number != null ? `M-${meeting.number}` : null,
          statusKey: meeting.status ?? null,
          href: `/calendar/meetings/${meeting.id}`,
        }
      : null,
    organizationOptions,
    contactOptions,
    projectOptions,
  };
}
