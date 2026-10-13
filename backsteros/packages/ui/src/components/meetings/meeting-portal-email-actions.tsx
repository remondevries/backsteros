"use client";

import { useCallback, useEffect, useState } from "react";

import type { MeetingListItem } from "../../meetings/meetings.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";

type AttendeePortalEmails = NonNullable<
  MeetingListItem["attendeePortalEmails"]
>;

export type MeetingPortalEmailActionsProps = {
  attendeeContactIds: readonly string[];
  attendeeOptions: readonly SearchableDropdownOption<string>[];
  attendeePortalEmails?: AttendeePortalEmails;
  onSendInvite?: (contactId: string) => void | Promise<void>;
  onSendReminder?: (contactId: string) => void | Promise<void>;
  resolveContactHref?: (contactId: string) => string | null;
  onNavigateHref?: (href: string) => void;
  layout?: "tab";
};

type ContactRowState = {
  inviteSending: boolean;
  reminderSending: boolean;
  /** Brief button label after a successful send. */
  inviteFeedback: boolean;
  reminderFeedback: boolean;
  /** Persistent — drives the avatar sent indicator. */
  inviteEmailed: boolean;
  reminderEmailed: boolean;
  error: string | null;
};

type SentIndicatorVariant = "invite" | "reminder";

function persistedEmailFlags(
  contactId: string,
  attendeePortalEmails: AttendeePortalEmails | undefined,
): Pick<ContactRowState, "inviteEmailed" | "reminderEmailed"> {
  const entry = attendeePortalEmails?.[contactId];
  return {
    inviteEmailed: Boolean(entry?.inviteSentAt),
    reminderEmailed: Boolean(entry?.reminderSentAt),
  };
}

function sentIndicator(
  state: Pick<ContactRowState, "inviteEmailed" | "reminderEmailed">,
): { label: string; variant: SentIndicatorVariant } | null {
  if (state.reminderEmailed) {
    return {
      variant: "reminder",
      label: state.inviteEmailed
        ? "Invite and reminder emails sent"
        : "Reminder email sent",
    };
  }
  if (state.inviteEmailed) {
    return { variant: "invite", label: "Invite email sent" };
  }
  return null;
}

type AttendeeDisplay = {
  contactId: string;
  name: string;
  email: string | null;
  avatarSrc: string | null;
};

function attendeeDisplay(
  contactId: string,
  attendeeOptions: readonly SearchableDropdownOption<string>[],
): AttendeeDisplay {
  const option = attendeeOptions.find((entry) => entry.value === contactId);
  const name = option?.label?.trim() || "Contact";
  const email = extractEmailFromSearchTerms(option?.searchTerms);
  return {
    contactId,
    name,
    email,
    avatarSrc: option?.avatarSrc ?? null,
  };
}

function extractEmailFromSearchTerms(terms: string | undefined): string | null {
  if (!terms?.trim()) return null;
  const match = terms.match(/[^\s,]+@[^\s,]+\.[^\s,]+/);
  return match?.[0]?.trim() ?? null;
}

function AttendeeAvatar({
  name,
  avatarSrc,
  sentIndicator,
}: {
  name: string;
  avatarSrc: string | null;
  sentIndicator: { label: string; variant: SentIndicatorVariant } | null;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="meeting-attendee-email-list__avatar-wrap">
      {avatarSrc ? (
        <EntityListAvatar
          src={avatarSrc}
          size={32}
          align="top"
          className="meeting-attendee-email-list__avatar"
        />
      ) : (
        <span
          className="meeting-attendee-email-list__avatar-fallback"
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
      {sentIndicator ? (
        <span
          className={[
            "meeting-attendee-email-list__sent-dot",
            sentIndicator.variant === "reminder"
              ? "meeting-attendee-email-list__sent-dot--reminder"
              : "meeting-attendee-email-list__sent-dot--invite",
          ].join(" ")}
          role="status"
          aria-label={sentIndicator.label}
          title={sentIndicator.label}
        />
      ) : null}
    </div>
  );
}

function ContactEmailRow({
  attendee,
  attendeePortalEmails,
  onSendInvite,
  onSendReminder,
  contactHref,
  onNavigateHref,
}: {
  attendee: AttendeeDisplay;
  attendeePortalEmails?: AttendeePortalEmails;
  onSendInvite?: (contactId: string) => void | Promise<void>;
  onSendReminder?: (contactId: string) => void | Promise<void>;
  contactHref: string | null;
  onNavigateHref?: (href: string) => void;
}) {
  const [state, setState] = useState<ContactRowState>(() => ({
    inviteSending: false,
    reminderSending: false,
    inviteFeedback: false,
    reminderFeedback: false,
    ...persistedEmailFlags(attendee.contactId, attendeePortalEmails),
    error: null,
  }));

  useEffect(() => {
    const persisted = persistedEmailFlags(
      attendee.contactId,
      attendeePortalEmails,
    );
    setState((prev) => ({
      ...prev,
      inviteEmailed: persisted.inviteEmailed,
      reminderEmailed: persisted.reminderEmailed,
    }));
  }, [attendee.contactId, attendeePortalEmails]);

  const run = useCallback(
    async (kind: "invite" | "reminder") => {
      const handler = kind === "invite" ? onSendInvite : onSendReminder;
      if (!handler) return;
      const sendingKey =
        kind === "invite" ? "inviteSending" : "reminderSending";
      const feedbackKey =
        kind === "invite" ? "inviteFeedback" : "reminderFeedback";
      const emailedKey =
        kind === "invite" ? "inviteEmailed" : "reminderEmailed";
      setState((prev) => ({
        ...prev,
        [sendingKey]: true,
        error: null,
      }));
      try {
        await handler(attendee.contactId);
        setState((prev) => ({
          ...prev,
          [sendingKey]: false,
          [feedbackKey]: true,
          [emailedKey]: true,
        }));
        window.setTimeout(() => {
          setState((prev) => ({
            ...prev,
            [feedbackKey]: false,
          }));
        }, 2500);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          [sendingKey]: false,
          error:
            error instanceof Error ? error.message : "Unable to send email",
        }));
      }
    },
    [attendee.contactId, onSendInvite, onSendReminder],
  );

  const indicator = sentIndicator(state);

  return (
    <li className="meeting-attendee-email-list__row">
      <div className="meeting-attendee-email-list__person">
        <AttendeeAvatar
          name={attendee.name}
          avatarSrc={attendee.avatarSrc}
          sentIndicator={indicator}
        />
        <div className="meeting-attendee-email-list__copy">
          {contactHref ? (
            <a
              href={contactHref}
              className="meeting-attendee-email-list__name meeting-attendee-email-list__name-link"
              title={`Open ${attendee.name}`}
              onClick={(event) => {
                if (!onNavigateHref) return;
                event.preventDefault();
                onNavigateHref(contactHref);
              }}
            >
              {attendee.name}
            </a>
          ) : (
            <span className="meeting-attendee-email-list__name">{attendee.name}</span>
          )}
          {attendee.email ? (
            <span className="meeting-attendee-email-list__email">
              {attendee.email}
            </span>
          ) : null}
        </div>
      </div>
      <div className="meeting-attendee-email-list__actions">
        {onSendInvite ? (
          <button
            type="button"
            className="meeting-attendee-email-list__button"
            disabled={state.inviteSending}
            onClick={() => {
              void run("invite");
            }}
          >
            {state.inviteSending
              ? "Sending…"
              : state.inviteFeedback
                ? "Invite sent"
                : "Invite"}
          </button>
        ) : null}
        {onSendReminder ? (
          <button
            type="button"
            className="meeting-attendee-email-list__button"
            disabled={state.reminderSending}
            onClick={() => {
              void run("reminder");
            }}
          >
            {state.reminderSending
              ? "Sending…"
              : state.reminderFeedback
                ? "Reminder sent"
                : "Reminder"}
          </button>
        ) : null}
      </div>
      {state.error ? (
        <p className="meeting-attendee-email-list__error" role="alert">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Staff actions — send portal meeting invite/reminder emails per attendee.
 * Rendered from the video-call Details content tab.
 */
export function MeetingPortalEmailActions({
  attendeeContactIds,
  attendeeOptions,
  attendeePortalEmails,
  onSendInvite,
  onSendReminder,
  resolveContactHref,
  onNavigateHref,
}: MeetingPortalEmailActionsProps) {
  const showActions = Boolean(onSendInvite || onSendReminder);

  if (!showActions) {
    return (
      <p className="content-markdown-empty-hint">
        Portal email actions are unavailable.
      </p>
    );
  }

  if (attendeeContactIds.length === 0) {
    return (
      <p className="content-markdown-empty-hint">
        Add attendees to send portal meeting emails.
      </p>
    );
  }

  return (
    <ul className="meeting-attendee-email-list">
      {attendeeContactIds.map((contactId) => (
        <ContactEmailRow
          key={contactId}
          attendee={attendeeDisplay(contactId, attendeeOptions)}
          attendeePortalEmails={attendeePortalEmails}
          onSendInvite={onSendInvite}
          onSendReminder={onSendReminder}
          contactHref={resolveContactHref?.(contactId) ?? null}
          onNavigateHref={onNavigateHref}
        />
      ))}
    </ul>
  );
}
