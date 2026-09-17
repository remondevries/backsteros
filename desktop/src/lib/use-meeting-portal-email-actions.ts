import { useCallback } from "react";

import type { MeetingAttendeePortalEmails } from "@backsteros/contracts";

import { useDesktopApi } from "./api-context";

type MeetingEmailResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  attendeePortalEmails?: MeetingAttendeePortalEmails;
};

export function useMeetingPortalEmailActions(
  meetingId: string | null | undefined,
  mergeMeetingLocalFields?: (
    fields: Record<string, unknown>,
  ) => void,
) {
  const { client } = useDesktopApi();

  const send = useCallback(
    async (contactId: string, kind: "invite" | "reminder") => {
      if (!meetingId) {
        throw new Error("Meeting is required");
      }
      const segment = kind === "invite" ? "send-invite" : "send-reminder";
      const response = await client.requestJson<MeetingEmailResponse>(
        `/api/v1/meetings/${encodeURIComponent(meetingId)}/${segment}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId }),
        },
      );
      if (response.error) {
        throw new Error(response.error);
      }
      if (response.attendeePortalEmails) {
        mergeMeetingLocalFields?.({
          attendeePortalEmails: response.attendeePortalEmails,
        });
      }
      return response;
    },
    [client, meetingId, mergeMeetingLocalFields],
  );

  const onSendMeetingInvite = useCallback(
    async (contactId: string) => {
      await send(contactId, "invite");
    },
    [send],
  );

  const onSendMeetingReminder = useCallback(
    async (contactId: string) => {
      await send(contactId, "reminder");
    },
    [send],
  );

  if (!meetingId) {
    return {
      onSendMeetingInvite: undefined,
      onSendMeetingReminder: undefined,
    };
  }

  return {
    onSendMeetingInvite,
    onSendMeetingReminder,
  };
}
