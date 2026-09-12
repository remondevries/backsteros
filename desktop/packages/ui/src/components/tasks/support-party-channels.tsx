"use client";

import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { MeetingPhoneIcon } from "../meetings/meeting-format-icons.js";
import {
  formatSupportChannelLabel,
  telHref,
  websiteHref,
  type SupportPartyEmail,
  type SupportPartyPhone,
} from "./support-party-card-types.js";

function WebsiteIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0ZM1.5 8a6.5 6.5 0 0 1 1.1-3.6h2.2c-.2.9-.3 1.9-.3 3.1s.1 2.2.3 3.1H2.6A6.5 6.5 0 0 1 1.5 8Zm2.7 4.6h1.9c.5 1.2 1.2 2.2 2 2.9A6.5 6.5 0 0 1 4.2 12.6Zm0-9.2A6.5 6.5 0 0 1 8.1.5c-.8.7-1.5 1.7-2 2.9H4.2Zm3.3 1.5c-.2.9-.3 1.9-.3 3.1s.1 2.2.3 3.1h1.8c.2-.9.3-1.9.3-3.1s-.1-2.2-.3-3.1H7.5Zm2.4-1.5c.5-1.2 1.2-2.2 2-2.9a6.5 6.5 0 0 1 3.9 2.9h-1.9Zm0 9.2h1.9a6.5 6.5 0 0 1-3.9 2.9c.8-.7 1.5-1.7 2-2.9Zm2.5-1.5c.2-.9.3-1.9.3-3.1s-.1-2.2-.3-3.1h2.2a6.5 6.5 0 0 1 0 6.2h-2.2Z" />
    </svg>
  );
}

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
      <WebsiteIcon />
      <span className="support-party-card__channel-body">
        <span className="support-party-card__channel-value">{label}</span>
      </span>
    </a>
  );
}
