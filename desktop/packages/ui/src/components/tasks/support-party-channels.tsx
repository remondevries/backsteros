"use client";

import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { MeetingPhoneIcon } from "../meetings/meeting-format-icons.js";
import { GlobeIcon } from "../icons/globe-icon.js";
import {
  formatSupportChannelLabel,
  telHref,
  websiteHref,
  type SupportPartyEmail,
  type SupportPartyPhone,
} from "./support-party-card-types.js";

export function SupportPartyEmailRows({
  emails,
}: {
  emails: SupportPartyEmail[];
}) {
  if (emails.length === 0) return null;
  return (
    <ul className="support-party-card__channels">
      {emails.map((entry) => (
        <li key={`email:${entry.address}`}>
          <a
            href={`mailto:${entry.address}`}
            className="support-party-card__channel"
            title={entry.address}
          >
            <EmailNavIcon size={12} />
            <span className="support-party-card__channel-body">
              {entry.label ? (
                <span className="support-party-card__channel-label">
                  {formatSupportChannelLabel(entry.label)}
                </span>
              ) : null}
              <span className="support-party-card__channel-value">
                {entry.address}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function SupportPartyPhoneRows({
  phones,
}: {
  phones: SupportPartyPhone[];
}) {
  if (phones.length === 0) return null;
  return (
    <ul className="support-party-card__channels">
      {phones.map((entry) => (
        <li key={`phone:${entry.number}`}>
          <a
            href={telHref(entry.number)}
            className="support-party-card__channel"
            title={entry.number}
          >
            <MeetingPhoneIcon size={12} />
            <span className="support-party-card__channel-body">
              {entry.label ? (
                <span className="support-party-card__channel-label">
                  {formatSupportChannelLabel(entry.label)}
                </span>
              ) : null}
              <span className="support-party-card__channel-value">
                {entry.number}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function SupportPartyWebsiteRow({
  website,
}: {
  website?: string | null;
}) {
  const href = website ? websiteHref(website) : null;
  if (!href || !website?.trim()) return null;
  const label = website.trim().replace(/^https?:\/\//i, "");
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="support-party-card__channel"
      title={website.trim()}
    >
      <GlobeIcon size={12} />
      <span className="support-party-card__channel-body">
        <span className="support-party-card__channel-value">{label}</span>
      </span>
    </a>
  );
}
