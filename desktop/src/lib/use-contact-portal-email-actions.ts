import { useCallback } from "react";

import { useDesktopApi } from "./api-context";

type ContactPortalEmailResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  email?: string;
};

export function useContactPortalEmailActions(
  contactId: string | null | undefined,
) {
  const { client } = useDesktopApi();

  const send = useCallback(
    async (action: "send-portal-invite" | "send-portal-password-reset") => {
      if (!contactId) {
        throw new Error("Contact is required");
      }
      const response = await client.requestJson<ContactPortalEmailResponse>(
        `/api/v1/contacts/${encodeURIComponent(contactId)}/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
      );
      if (response.error) {
        throw new Error(response.error);
      }
      return response;
    },
    [client, contactId],
  );

  const onSendPortalInvite = useCallback(async () => {
    await send("send-portal-invite");
  }, [send]);

  const onSendPortalPasswordReset = useCallback(async () => {
    await send("send-portal-password-reset");
  }, [send]);

  if (!contactId) {
    return {
      onSendPortalInvite: undefined,
      onSendPortalPasswordReset: undefined,
    };
  }

  return {
    onSendPortalInvite,
    onSendPortalPasswordReset,
  };
}
