"use client";

import { ClientLink } from "../../shared/client-link.js";
import { formatContactAddressLine } from "../contacts/contact-overview-view.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import {
  formatContactPeekJobSubtitle,
  splitContactPeekName,
} from "../contacts/contact-peek-card.js";
import {
  SupportPartyEmailRows,
  SupportPartyPhoneRows,
} from "./support-party-channels.js";
import type { SupportContactCardModel } from "./support-party-card-types.js";

export type SupportContactCardProps = {
  contact: SupportContactCardModel | null;
  viewHref?: string | null;
  className?: string;
};

/**
 * Rail card for the primary client on a support ticket — call/email ready.
 */
export function SupportContactCard({
  contact,
  viewHref,
  className,
}: SupportContactCardProps) {
  if (!contact) {
    return (
      <div
        className={["support-party-card", "is-empty", className]
          .filter(Boolean)
          .join(" ")}
      >
        <p className="support-party-card__empty">No contact linked</p>
      </div>
    );
  }

  const { firstName, lastName } = splitContactPeekName(contact);
  const job = formatContactPeekJobSubtitle(contact);
  const addressLine = formatContactAddressLine(contact);
  const hasChannels = contact.emails.length > 0 || contact.phones.length > 0;

  return (
    <div className={["support-party-card", className].filter(Boolean).join(" ")}>
      <div className="support-party-card__header">
        <EntityAvatarIcon
          src={contact.avatarSrc}
          size={36}
          kind="contact"
          className="support-party-card__avatar"
        />
        <div className="support-party-card__identity">
          <p className="support-party-card__name">
            <span>{firstName}</span>
            {lastName ? <span> {lastName}</span> : null}
          </p>
          {job ? <p className="support-party-card__subtitle">{job}</p> : null}
          {addressLine ? (
            <p className="support-party-card__address">{addressLine}</p>
          ) : null}
        </div>
      </div>

      {hasChannels ? (
        <div className="support-party-card__channel-groups">
          <SupportPartyEmailRows emails={contact.emails} />
          <SupportPartyPhoneRows phones={contact.phones} />
        </div>
      ) : (
        <p className="support-party-card__empty">No email or phone on file</p>
      )}

      {viewHref ? (
        <div className="support-party-card__footer">
          <ClientLink href={viewHref} className="support-party-card__open">
            View profile
          </ClientLink>
        </div>
      ) : null}
    </div>
  );
}
