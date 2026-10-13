"use client";

import { DocumentIcon } from "../documents/document-icon.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { LetterIcon } from "../letters/letter-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { ProjectStatusIcon } from "../projects/project-status-icon.js";
import {
  getOptionalTaskStatusLabel,
  type TaskStatus,
} from "../../tasks/task-status.js";
import type { MentionKind } from "../../mentions/mention-tokens.js";

export function MentionLeadingIcon({
  kind,
  status,
  projectIcon: _projectIcon,
  projectType: _projectType,
  contact,
  organization,
  size = 16,
}: {
  kind: MentionKind;
  status?: TaskStatus | string | null;
  projectIcon?: string | null;
  projectType?: string | null;
  documentIcon?: string | null;
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

  if (kind === "project") {
    return (
      <ProjectStatusIcon
        status={status ?? "backlog"}
        className="mention-menu__icon"
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
