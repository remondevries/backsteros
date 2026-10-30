"use client";

import { ArrowSwitchIcon } from "@primer/octicons-react";

import { MentionMessageChannelIcon } from "../communication/communication-kind-icons.js";
import { CalendarIcon } from "../icons/calendar-icon.js";
import { DocumentIcon } from "../documents/document-icon.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { FlameIcon } from "../icons/flame-icon.js";
import { JournalIcon } from "../icons/journal-icon.js";
import { LemoDesignMarkIcon } from "../icons/lemo-design-mark-icon.js";
import { LinkedInIcon } from "../icons/linkedin-icon.js";
import { MoneybirdIcon } from "../icons/moneybird-icon.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { LetterIcon } from "../letters/letter-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import {
  getOptionalTaskStatusLabel,
  type TaskStatus,
} from "../../tasks/task-status.js";
import type { MentionKind } from "../../mentions/mention-tokens.js";

export function MentionLeadingIcon({
  kind,
  status,
  projectIcon,
  channelType,
  contactName,
  contact,
  organization,
  size = 16,
}: {
  kind: MentionKind;
  status?: TaskStatus | string | null;
  projectIcon?: string | null;
  /** Kept for callers; project leading glyph ignores type defaults (nav box). */
  projectType?: string | null;
  documentIcon?: string | null;
  /** Chatwoot / communication channel for `kind: "message"`. */
  channelType?: string | null;
  contactName?: string | null;
  contact?: {
    id: string;
    avatarSrc?: string | null;
    avatarStorageKey?: string | null;
    avatarUpdatedAt?: number;
  } | null;
  organization?: {
    id: string;
    avatarSrc?: string | null;
  } | null;
  size?: number;
}) {
  if (kind === "task") {
    const statusLabel = getOptionalTaskStatusLabel(status);
    return (
      <TaskStatusIcon
        status={statusLabel ? (status ?? null) : null}
        title={statusLabel ?? "Unknown"}
        className="mention-menu__icon"
      />
    );
  }

  if (kind === "letter") {
    return (
      <LetterIcon
        size={size}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "email") {
    return (
      <EmailNavIcon
        size={size}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "meeting") {
    return (
      <CalendarIcon
        size={size}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "journal") {
    return (
      <JournalIcon
        size={size}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "habit") {
    return (
      <FlameIcon
        size={size}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "message") {
    return (
      <MentionMessageChannelIcon
        channelType={channelType}
        contactName={contactName}
        size={size}
      />
    );
  }

  if (kind === "post") {
    return (
      <LinkedInIcon
        size={size}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "transaction") {
    return (
      <ArrowSwitchIcon
        size={size}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "invoice") {
    return (
      <MoneybirdIcon
        size={size}
        withTile={false}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "estimate") {
    return (
      <LemoDesignMarkIcon
        size={size}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "project") {
    // Same box as Projects nav when unset; custom project icon when set.
    // Do not pass `type` — that would swap in terminal/mail defaults.
    return (
      <ProjectOcticon
        icon={projectIcon}
        size={size}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "contact") {
    return (
      <EntityAvatarIcon
        src={contact?.avatarSrc}
        size={size}
        kind="contact"
        className="mention-menu__icon mention-menu__icon--avatar"
      />
    );
  }

  if (kind === "organization") {
    return (
      <EntityAvatarIcon
        src={organization?.avatarSrc}
        size={size}
        kind="organization"
        className="mention-menu__icon mention-menu__icon--avatar"
      />
    );
  }

  return (
    <DocumentIcon
      size={size}
      className="mention-menu__icon mention-menu__icon--muted"
    />
  );
}
