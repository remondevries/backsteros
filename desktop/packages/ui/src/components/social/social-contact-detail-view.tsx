"use client";

import type { ReactNode } from "react";
import { LocationIcon } from "@primer/octicons-react";

import { formatContactAddressLine } from "../contacts/contact-overview-view.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { SocialPlatformIcon } from "./social-platform-icon.js";
import type { ContactSocialAccount } from "../contacts/contact-social-accounts-editor.js";

export type SocialContactDetailViewContact = {
  id: string;
  name: string;
  title?: string | null;
  summary?: string | null;
  socialAccounts: ContactSocialAccount[];
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  region?: string | null;
  country?: string | null;
  organizationName?: string | null;
  avatarSrc?: string | null;
};

export type SocialContactDetailViewProps = {
  contact: SocialContactDetailViewContact;
  /** Optional upload/control slot; defaults to a static avatar. */
  headerAccessory?: ReactNode;
};

export function SocialContactDetailView({
  contact,
  headerAccessory,
}: SocialContactDetailViewProps) {
  const title = contact.title?.trim() || null;
  const summary = contact.summary?.trim() || null;
  const organizationName = contact.organizationName?.trim() || null;
  const addressLine = formatContactAddressLine({
    address: contact.address,
    city: contact.city,
    postalCode: contact.postalCode,
    region: contact.region,
    country: contact.country,
  });
  const accounts = contact.socialAccounts.filter(
    (entry) => entry.url.trim().length > 0,
  );

  return (
    <div className="social-contact-detail">
      <div className="social-contact-detail__avatar">
        {headerAccessory ?? (
          contact.avatarSrc ? (
            <img
              src={contact.avatarSrc}
              alt=""
              className="social-contact-detail__avatar-img"
            />
          ) : (
            <span
              className="social-contact-detail__avatar-fallback"
              aria-hidden="true"
            >
              <ContactPersonIcon size={40} />
            </span>
          )
        )}
      </div>

      <h1 className="social-contact-detail__name">{contact.name}</h1>

      {title ? (
        <p className="social-contact-detail__title">{title}</p>
      ) : null}

      {accounts.length > 0 ? (
        <ul className="social-contact-detail__links" aria-label="Social links">
          {accounts.map((account) => (
            <li key={`${account.platform}-${account.url}`}>
              <a
                href={account.url}
                target="_blank"
                rel="noopener noreferrer"
                className="social-contact-detail__link"
                aria-label={account.platform}
                title={account.platform}
              >
                <SocialPlatformIcon platform={account.platform} size={16} />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {summary ? (
        <p className="social-contact-detail__summary">{summary}</p>
      ) : null}

      {addressLine || organizationName ? (
        <ul className="social-contact-detail__meta">
          {addressLine ? (
            <li className="social-contact-detail__meta-row">
              <LocationIcon size={14} />
              <span>{addressLine}</span>
            </li>
          ) : null}
          {organizationName ? (
            <li className="social-contact-detail__meta-row">
              <OrganizationIcon size={14} />
              <span>{organizationName}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
