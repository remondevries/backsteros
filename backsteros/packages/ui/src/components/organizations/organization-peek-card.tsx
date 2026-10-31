"use client";

import { ClientLink } from "../../shared/client-link.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";

export type OrganizationPeekCardOrganization = {
  id: string;
  name: string;
  key?: string | null;
  email?: string | null;
  summary?: string | null;
  avatarSrc?: string | null;
};

export type OrganizationPeekCardAction = {
  href?: string | null;
  onClick?: () => void;
};

export type OrganizationPeekCardProps = {
  organization: OrganizationPeekCardOrganization;
  titleId?: string;
  viewProfile?: OrganizationPeekCardAction | (() => void);
  className?: string;
};

function normalizeAction(
  action: OrganizationPeekCardAction | (() => void) | undefined,
): OrganizationPeekCardAction | null {
  if (!action) return null;
  if (typeof action === "function") return { onClick: action };
  if (!action.href && !action.onClick) return null;
  return action;
}

/**
 * Same chrome as {@link ContactPeekCard} — avatar + name + meta + email +
 * “View profile”. Used for @organization hover popovers and chat cards.
 */
export function OrganizationPeekCard({
  organization,
  titleId,
  viewProfile,
  className,
}: OrganizationPeekCardProps) {
  const name = organization.name.trim() || organization.key?.trim() || "Organization";
  const summary = organization.summary?.trim() || "";
  const email = organization.email?.trim() || "";
  const profileAction = normalizeAction(viewProfile);

  return (
    <div
      className={["contact-peek-card", className].filter(Boolean).join(" ")}
    >
      <div className="contact-peek-card__person">
        <EntityAvatarIcon
          src={organization.avatarSrc}
          size={56}
          kind="organization"
          className="contact-peek-card__avatar"
        />
        <div className="contact-peek-card__identity">
          <h2 id={titleId} className="contact-peek-card__name">
            <span>{name}</span>
          </h2>

          {summary ? (
            <p className="contact-peek-card__job">
              <span>{summary}</span>
            </p>
          ) : null}

          {email ? (
            <div className="contact-peek-card__contact-row">
              <a
                href={`mailto:${email}`}
                className="contact-peek-card__contact-item"
                title={email}
              >
                <EmailNavIcon size={12} />
                <span>{email}</span>
              </a>
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
