"use client";

import {
  getContactEmailAddresses,
  getContactPhoneNumbers,
} from "@backsteros/contracts";

import { socialPlatformIcon } from "../../contacts/social-platforms.js";
import { formatContactAddressLine } from "./contact-overview-view.js";
import { ClientLink } from "../../shared/client-link.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { MeetingPhoneIcon } from "../meetings/meeting-format-icons.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";

export type ContactPeekSocialAccount = {
  platform: string;
  url: string;
};

export type ContactPeekCardContact = {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  organizationName?: string | null;
  organizationAvatarSrc?: string | null;
  avatarSrc?: string | null;
  email?: string | null;
  emails?: Array<{ label?: string | null; address?: string | null }> | null;
  phone?: string | null;
  phones?: Array<{ label?: string | null; number?: string | null }> | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  region?: string | null;
  country?: string | null;
  socialAccounts?: ContactPeekSocialAccount[] | null;
};

export type ContactPeekCardAction = {
  href?: string | null;
  onClick?: () => void;
};

export type ContactPeekCardProps = {
  contact: ContactPeekCardContact;
  titleId?: string;
  viewProfile?: ContactPeekCardAction | (() => void);
  className?: string;
};

export function formatContactPeekJobSubtitle(
  contact: Pick<ContactPeekCardContact, "title" | "organizationName">,
): string | null {
  const title = contact.title?.trim() || "";
  const org = contact.organizationName?.trim() || "";
  if (title && org) return `${title} at ${org}`;
  if (title) return title;
  if (org) return org;
  return null;
}

export function splitContactPeekName(
  contact: Pick<ContactPeekCardContact, "name" | "firstName" | "lastName">,
): { firstName: string; lastName: string } {
  const firstName =
    contact.firstName?.trim() ||
    contact.name.trim().split(/\s+/)[0] ||
    contact.name.trim() ||
    "Contact";
  const lastName =
    contact.lastName?.trim() ||
    (contact.firstName?.trim()
      ? ""
      : contact.name.trim().split(/\s+/).slice(1).join(" "));
  return { firstName, lastName };
}

function normalizeAction(
  action: ContactPeekCardAction | (() => void) | undefined,
): ContactPeekCardAction | null {
  if (!action) return null;
  if (typeof action === "function") return { onClick: action };
  if (!action.href && !action.onClick) return null;
  return action;
}

function primaryEmail(contact: ContactPeekCardContact): string | null {
  return getContactEmailAddresses(contact)[0] ?? null;
}

function primaryPhone(contact: ContactPeekCardContact): string | null {
  return getContactPhoneNumbers(contact)[0] ?? null;
}

/**
 * Compact contact identity card — avatar + name + job/org + address +
 * email/phone/social icons. Shared by birthday calendar popover and @-mention hover.
 */
export function ContactPeekCard({
  contact,
  titleId,
  viewProfile,
  className,
}: ContactPeekCardProps) {
  const { firstName, lastName } = splitContactPeekName(contact);
  const title = contact.title?.trim() || "";
  const orgName = contact.organizationName?.trim() || "";
  const addressLine = formatContactAddressLine(contact);
  const email = primaryEmail(contact);
  const phone = primaryPhone(contact);
  const socialAccounts = (contact.socialAccounts ?? []).filter(
    (entry) => entry.platform?.trim() && entry.url?.trim(),
  );
  const profileAction = normalizeAction(viewProfile);
  const hasContactRow = Boolean(email) || Boolean(phone);
  const hasSocialIcons = socialAccounts.length > 0;

  return (
    <div
      className={["contact-peek-card", className].filter(Boolean).join(" ")}
    >
      <div className="contact-peek-card__person">
        <EntityAvatarIcon
          src={contact.avatarSrc}
          size={56}
          kind="contact"
          className="contact-peek-card__avatar"
        />
        <div className="contact-peek-card__identity">
          <h2 id={titleId} className="contact-peek-card__name">
            <span>{firstName}</span>
            {lastName ? <span> {lastName}</span> : null}
          </h2>

          {title || orgName ? (
            <p className="contact-peek-card__job">
              {title ? <span>{title}</span> : null}
              {title && orgName ? (
                <span className="contact-peek-card__job-at"> at </span>
              ) : null}
              {orgName ? (
                <span className="contact-peek-card__org">
                  <EntityAvatarIcon
                    src={contact.organizationAvatarSrc}
                    size={14}
                    kind="organization"
                    className="contact-peek-card__org-avatar"
                  />
                  <span className="contact-peek-card__org-name">{orgName}</span>
                </span>
              ) : null}
            </p>
          ) : null}

          {addressLine ? (
            <p className="contact-peek-card__meta-line contact-peek-card__address">
              {addressLine}
            </p>
          ) : null}

          {hasContactRow ? (
            <div className="contact-peek-card__contact-row">
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="contact-peek-card__contact-item"
                  title={email}
                >
                  <EmailNavIcon size={12} />
                  <span>{email}</span>
                </a>
              ) : null}
              {phone ? (
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="contact-peek-card__contact-item"
                  title={phone}
                >
                  <MeetingPhoneIcon size={12} />
                  <span>{phone}</span>
                </a>
              ) : null}
            </div>
          ) : null}

          {hasSocialIcons ? (
            <div
              className="contact-peek-card__icons"
              aria-label="Social profiles"
            >
              {socialAccounts.map((account) => (
                <a
                  key={`${account.platform}:${account.url}`}
                  href={account.url}
                  target="_blank"
                  rel="noreferrer"
                  className="contact-peek-card__icon-link"
                  title={account.platform}
                  aria-label={account.platform}
                >
                  {socialPlatformIcon(account.platform, 14)}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {profileAction ? (
        <div className="contact-peek-card__footer">
          {profileAction.href ? (
            <ClientLink
              href={profileAction.href}
              className="contact-peek-card__open"
              onClick={profileAction.onClick}
            >
              View profile
            </ClientLink>
          ) : (
            <button
              type="button"
              className="contact-peek-card__open"
              onClick={profileAction.onClick}
            >
              View profile
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
