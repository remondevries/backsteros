"use client";

import { useMemo, useState } from "react";

import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";
import { CommunicationKindMark } from "./communication-kind-icons.js";

export type CommunicationChannelCreateChannel =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "telegram"
  | "support"
  | "x";

export type CommunicationChannelCreateTemplateOption = {
  name: string;
  category: string | null;
  language: string | null;
  body: string | null;
};

export type CommunicationChannelCreateWindow = {
  open: boolean;
  requiresTemplate: boolean;
  reason: string | null;
  windowHours: number;
};

export type CommunicationChannelCreateFormProps = {
  channel: CommunicationChannelCreateChannel;
  contactOptions: readonly SearchableDropdownOption<string>[];
  inboxOptions?: readonly SearchableDropdownOption<string>[];
  templateOptions?: readonly CommunicationChannelCreateTemplateOption[];
  windowState: CommunicationChannelCreateWindow | null;
  windowLoading?: boolean;
  submitting?: boolean;
  error?: string | null;
  onContactChange: (contactId: string | null) => void;
  onInboxChange?: (inboxId: string | null) => void;
  onCancel: () => void;
  onSubmit: (input: {
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
  }) => void;
};

function channelLabel(channel: CommunicationChannelCreateChannel): string {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "instagram") return "Instagram";
  if (channel === "messenger") return "Messenger";
  if (channel === "telegram") return "Telegram";
  if (channel === "x") return "X";
  return "Support ticket";
}

function kindMark(
  channel: CommunicationChannelCreateChannel,
): "whatsapp" | "instagram" | "messenger" | "telegram" | "support" | "x" {
  return channel;
}

/**
 * Center-pane create form for WhatsApp / Instagram / Messenger / Telegram /
 * Support. Parent loads contacts, window status, and WhatsApp templates.
 */
export function CommunicationChannelCreateForm({
  channel,
  contactOptions,
  inboxOptions = [],
  templateOptions = [],
  windowState,
  windowLoading = false,
  submitting = false,
  error = null,
  onContactChange,
  onInboxChange,
  onCancel,
  onSubmit,
}: CommunicationChannelCreateFormProps) {
  const [contactId, setContactId] = useState<string | null>(null);
  const [inboxId, setInboxId] = useState<string | null>(
    () => inboxOptions[0]?.value ?? null,
  );
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  const label = channelLabel(channel);
  const selectedTemplate = useMemo(() => {
    if (!templateKey) return null;
    return (
      templateOptions.find(
        (template) =>
          `${template.name}::${template.language ?? ""}` === templateKey,
      ) ?? null
    );
  }, [templateKey, templateOptions]);

  const templateVarKeys = useMemo(() => {
    const body = selectedTemplate?.body ?? "";
    const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
    return [...new Set(matches.map((match) => match.replace(/[{}]/g, "")))];
  }, [selectedTemplate]);

  const templateSelectOptions = useMemo(
    (): SearchableDropdownOption<string>[] =>
      templateOptions.map((template) => ({
        value: `${template.name}::${template.language ?? ""}`,
        label: template.name,
        secondaryLabel: [template.language, template.category]
          .filter(Boolean)
          .join(" · "),
        searchTerms: `${template.name} ${template.body ?? ""}`,
      })),
    [templateOptions],
  );

  // WhatsApp: template mandatory when the Meta window is closed (or unknown).
  const requiresTemplate =
    channel === "whatsapp" &&
    contactId != null &&
    (windowState == null || windowState.requiresTemplate);
  const blocked =
    channel !== "whatsapp" &&
    contactId != null &&
    windowState != null &&
    !windowState.open;
  const needsSubject = channel === "support";
  const canSubmit =
    Boolean(contactId) &&
    !submitting &&
    !blocked &&
    (!needsSubject || subject.trim().length > 0) &&
    (requiresTemplate
      ? Boolean(selectedTemplate)
      : content.trim().length > 0) &&
    (channel !== "whatsapp" || Boolean(inboxId || inboxOptions.length === 0));

  function handleSubmit() {
    if (!contactId || !canSubmit) return;
    if (requiresTemplate && selectedTemplate) {
      const processedParams =
        templateVarKeys.length > 0
          ? Object.fromEntries(
              templateVarKeys.map((key) => [key, templateVars[key] ?? ""]),
            )
          : undefined;
      let rendered = selectedTemplate.body ?? selectedTemplate.name;
      if (processedParams) {
        for (const [key, value] of Object.entries(processedParams)) {
          rendered = rendered.replaceAll(`{{${key}}}`, value);
        }
      }
      onSubmit({
        contactId,
        inboxId,
        content: rendered.trim() || selectedTemplate.name,
        template: {
          name: selectedTemplate.name,
          category: selectedTemplate.category ?? "UTILITY",
          language: selectedTemplate.language ?? "en",
          processedParams,
        },
      });
      return;
    }
    onSubmit({
      contactId,
      inboxId,
      content: content.trim(),
      subject: needsSubject ? subject.trim() : undefined,
    });
  }

  return (
    <div className="communication-channel-create">
      <div className="communication-channel-create__header">
        <CommunicationKindMark kind={kindMark(channel)} />
        <h3 className="communication-channel-create__title">
          {channel === "support" ? "New support ticket" : `New ${label} conversation`}
        </h3>
      </div>

      <label className="communication-channel-create__field">
        <span className="communication-channel-create__label">Contact</span>
        <SearchableDropdown
          value={contactId}
          options={[...contactOptions]}
          ariaLabel="Contact"
          emptySelectionLabel="Select a contact…"
          searchPlaceholder="Search contacts…"
          allowDeselect
          onClear={() => {
            setContactId(null);
            onContactChange(null);
          }}
          onChange={(next) => {
            setContactId(next);
            onContactChange(next);
          }}
        />
      </label>

      {channel === "whatsapp" && inboxOptions.length > 1 ? (
        <label className="communication-channel-create__field">
          <span className="communication-channel-create__label">Inbox</span>
          <SearchableDropdown
            value={inboxId}
            options={[...inboxOptions]}
            ariaLabel="WhatsApp inbox"
            emptySelectionLabel="WhatsApp inbox…"
            searchPlaceholder="Search inboxes…"
            onChange={(next) => {
              setInboxId(next);
              onInboxChange?.(next);
            }}
          />
        </label>
      ) : null}

      {windowLoading ? (
        <p className="communication-channel-create__hint">
          Checking messaging window…
        </p>
      ) : null}

      {contactId && windowState?.reason ? (
        <p
          className={[
            "communication-channel-create__notice",
            blocked
              ? "communication-channel-create__notice--blocked"
              : "communication-channel-create__notice--info",
          ].join(" ")}
        >
          {windowState.reason}
        </p>
      ) : null}

      {needsSubject ? (
        <label className="communication-channel-create__field">
          <span className="communication-channel-create__label">Subject</span>
          <input
            className="communication-channel-create__input"
            value={subject}
            disabled={blocked}
            placeholder="Support ticket subject…"
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
      ) : null}

      {requiresTemplate ? (
        <>
          <label className="communication-channel-create__field">
            <span className="communication-channel-create__label">
              Template (required)
            </span>
            <SearchableDropdown
              value={templateKey}
              options={templateSelectOptions}
              ariaLabel="WhatsApp template"
              emptySelectionLabel="Select an approved template…"
              searchPlaceholder="Search templates…"
              allowDeselect
              onClear={() => {
                setTemplateKey(null);
                setTemplateVars({});
              }}
              onChange={(next) => {
                setTemplateKey(next);
                setTemplateVars({});
              }}
            />
          </label>
          {selectedTemplate?.body ? (
            <p className="communication-channel-create__template-preview">
              {selectedTemplate.body}
            </p>
          ) : null}
          {templateVarKeys.map((key) => (
            <label
              key={key}
              className="communication-channel-create__field"
            >
              <span className="communication-channel-create__label">
                Variable {`{{${key}}}`}
              </span>
              <input
                className="communication-channel-create__input"
                value={templateVars[key] ?? ""}
                onChange={(event) =>
                  setTemplateVars((prev) => ({
                    ...prev,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </>
      ) : (
        <label className="communication-channel-create__field">
          <span className="communication-channel-create__label">
            {channel === "support" ? "Message" : "Message"}
          </span>
          <textarea
            className="communication-channel-create__textarea"
            rows={5}
            value={content}
            disabled={blocked}
            placeholder={
              blocked
                ? "Messaging window is closed"
                : channel === "support"
                  ? "Describe the support request…"
                  : `Write a ${label} message…`
            }
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
      )}

      {error ? (
        <p className="communication-channel-create__error">{error}</p>
      ) : null}

      <div className="communication-channel-create__actions">
        <button
          type="button"
          className="communication-channel-create__button"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="communication-channel-create__button communication-channel-create__button--primary"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting ? "Sending…" : channel === "support" ? "Create ticket" : "Send"}
        </button>
      </div>
    </div>
  );
}
