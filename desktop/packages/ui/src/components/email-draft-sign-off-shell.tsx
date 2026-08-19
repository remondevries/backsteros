"use client";

import { EntityAvatarIcon } from "./entity-avatar-icon.js";

export type EmailDraftSignOffShellProps = {
  children: string;
  avatarSrc?: string | null;
};

const SIGN_OFF_AVATAR_SIZE = 96;

/**
 * Fixed sign-off block — contact avatar beside the footer message.
 */
export function EmailDraftSignOffShell({
  children,
  avatarSrc = null,
}: EmailDraftSignOffShellProps) {
  return (
    <div className="email-draft-sign-off">
      <EntityAvatarIcon
        src={avatarSrc}
        size={SIGN_OFF_AVATAR_SIZE}
        kind="contact"
        className="email-draft-sign-off__avatar"
      />
      <p className="email-draft-sign-off__text">{children}</p>
    </div>
  );
}
