import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ChatConversationDetail,
  ChatCreateChannel,
  ChatInboxesList,
  ChatMessagingWindow,
  ChatWhatsAppTemplatesList,
} from "@backsteros/contracts";
import {
  CommunicationChannelCreateForm,
  type SearchableDropdownOption,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

type DesktopCommunicationChannelCreateProps = {
  channel: ChatCreateChannel;
  contactOptions: readonly SearchableDropdownOption<string>[];
  onCancel: () => void;
  onCreated: (conversation: ChatConversationDetail) => void;
};

export function DesktopCommunicationChannelCreate({
  channel,
  contactOptions,
  onCancel,
  onCreated,
}: DesktopCommunicationChannelCreateProps) {
  const { client } = useDesktopApi();
  const [contactId, setContactId] = useState<string | null>(null);
  const [inboxId, setInboxId] = useState<string | null>(null);
  const [inboxes, setInboxes] = useState<ChatInboxesList | null>(null);
  const [windowState, setWindowState] = useState<ChatMessagingWindow | null>(
    null,
  );
  const [windowLoading, setWindowLoading] = useState(false);
  const [templates, setTemplates] = useState<ChatWhatsAppTemplatesList | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await client.requestJson<ChatInboxesList>(
          `/api/v1/chat/inboxes?channel=${encodeURIComponent(channel)}`,
        );
        if (cancelled) return;
        setInboxes(list);
        setInboxId((current) => current ?? list.inboxes[0]?.id ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load Chatwoot inboxes.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel, client]);

  useEffect(() => {
    if (!contactId) {
      setWindowState(null);
      return;
    }
    let cancelled = false;
    setWindowLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          channel,
          contactId,
        });
        const next = await client.requestJson<ChatMessagingWindow>(
          `/api/v1/chat/messaging-window?${params.toString()}`,
        );
        if (cancelled) return;
        setWindowState(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setWindowState(null);
        setError(
          err instanceof Error
            ? err.message
            : "Could not check the messaging window.",
        );
      } finally {
        if (!cancelled) setWindowLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel, client, contactId]);

  useEffect(() => {
    if (channel !== "whatsapp") {
      setTemplates(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams();
        if (inboxId) params.set("inboxId", inboxId);
        const qs = params.toString();
        const list = await client.requestJson<ChatWhatsAppTemplatesList>(
          `/api/v1/chat/whatsapp-templates${qs ? `?${qs}` : ""}`,
        );
        if (cancelled) return;
        setTemplates(list);
      } catch (err) {
        if (cancelled) return;
        setTemplates({ inboxId: inboxId ?? "", templates: [] });
        setError(
          err instanceof Error
            ? err.message
            : "Could not load WhatsApp templates.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel, client, inboxId]);

  const inboxOptions = useMemo(
    (): SearchableDropdownOption<string>[] =>
      (inboxes?.inboxes ?? []).map((inbox) => ({
        value: inbox.id,
        label: inbox.name,
        secondaryLabel: inbox.channelType ?? undefined,
      })),
    [inboxes],
  );

  const templateOptions = useMemo(
    () =>
      (templates?.templates ?? []).map((template) => ({
        name: template.name,
        category: template.category,
        language: template.language,
        body: template.body,
      })),
    [templates],
  );

  const handleSubmit = useCallback(
    async (input: {
      contactId: string;
      inboxId: string | null;
      content: string;
      subject?: string;
      template?: {
        name: string;
        category: string;
        language: string;
        processedParams?: Record<string, string>;
      };
    }) => {
      setSubmitting(true);
      setError(null);
      try {
        const detail = await client.requestJson<ChatConversationDetail>(
          "/api/v1/chat/conversations",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              channel,
              contactId: input.contactId,
              inboxId: input.inboxId ?? undefined,
              content: input.content,
              subject: input.subject,
              template: input.template,
            }),
          },
        );
        onCreated(detail);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not create the conversation.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [channel, client, onCreated],
  );

  return (
    <CommunicationChannelCreateForm
      channel={channel}
      contactOptions={contactOptions}
      inboxOptions={inboxOptions}
      templateOptions={templateOptions}
      windowState={
        windowState
          ? {
              open: windowState.open,
              requiresTemplate: windowState.requiresTemplate,
              reason: windowState.reason,
              windowHours: windowState.windowHours,
            }
          : null
      }
      windowLoading={windowLoading}
      submitting={submitting}
      error={error}
      onContactChange={setContactId}
      onInboxChange={setInboxId}
      onCancel={onCancel}
      onSubmit={handleSubmit}
    />
  );
}
