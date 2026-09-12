"use client";

import { ClientLink } from "../../shared/client-link.js";
import { formatContactAddressLine } from "../contacts/contact-overview-view.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import {
  SupportPartyEmailRows,
  SupportPartyPhoneRows,
  SupportPartyWebsiteRow,
} from "./support-party-channels.js";
import type { SupportOrganizationCardModel } from "./support-party-card-types.js";

export type SupportOrganizationCardProps = {
  organization: SupportOrganizationCardModel | null;
  viewHref?: string | null;
  className?: string;
};

/**
 * Rail card for the client organization on a support ticket — call/email ready.
 */
export function SupportOrganizationCard({
  organization,
  viewHref,
  className,
}: SupportOrganizationCardProps) {
  if (!organization) {
    return (
      <div
        className={["support-party-card", "is-empty", className]
          .filter(Boolean)
          .join(" ")}
      >
        <p className="support-party-card__empty">No organization linked</p>
      </div>
    );
  }

  const addressLine = formatContactAddressLine(organization);
  const hasChannels =
    Boolean(organization.website?.trim()) ||
    organization.emails.length > 0 ||
    organization.phones.length > 0;

  return (
    <div className={["support-party-card", className].filter(Boolean).join(" ")}>
      <div className="support-party-card__header">
        <EntityAvatarIcon
          src={organization.avatarSrc}
          size={36}
          kind="organization"
          className="support-party-card__avatar"
        />
        <div className="support-party-card__identity">
          <p className="support-party-card__name">{organization.name}</p>
        </div>
      </div>

      {addressLine ? (
        <p className="support-party-card__address">{addressLine}</p>
      ) : null}

      {hasChannels ? (
        <div className="support-party-card__channel-groups">
          <SupportPartyWebsiteRow website={organization.website} />
          <SupportPartyEmailRows emails={organization.emails} />
          <SupportPartyPhoneRows phones={organization.phones} />
        </div>
      ) : (
        <p className="support-party-card__empty">No website, email, or phone on file</p>
      )}

      {viewHref ? (
        <div className="support-party-card__footer">
          <ClientLink href={viewHref} className="support-party-card__open">
            View organization
          </ClientLink>
        </div>
      ) : null}
    </div>
  );
}
