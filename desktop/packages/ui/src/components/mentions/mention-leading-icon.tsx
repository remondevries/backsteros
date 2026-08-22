"use client";

import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "../projects/project-octicon.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { DocumentIcon } from "../documents/document-icon.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { LetterIcon } from "../letters/letter-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import type { TaskStatus } from "../../tasks/task-status.js";
import type { MentionKind } from "../../mentions/mention-tokens.js";

export function MentionLeadingIcon({
  kind,
  status,
  projectIcon,
  projectType,
}: {
  kind: MentionKind;
  status?: TaskStatus | null;
  projectIcon?: string | null;
  projectType?: string | null;
  documentIcon?: string | null;
  contact?: {
    id: string;
    avatarStorageKey: string | null;
    avatarUpdatedAt: number;
  } | null;
}) {
  if (kind === "task") {
    return (
      <TaskStatusIcon
        status={status ?? "backlog"}
        className="mention-menu__icon"
      />
    );
  }

  if (kind === "letter") {
    return (
      <LetterIcon
        size={16}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "email") {
    return (
      <EmailNavIcon
        size={16}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "project") {
    return (
      <ProjectOcticon
        icon={getDisplayProjectIcon(projectIcon, projectType)}
        type={projectType}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "contact") {
    return (
      <ContactPersonIcon
        size={16}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  if (kind === "organization") {
    return (
      <OrganizationIcon
        size={16}
        className="mention-menu__icon mention-menu__icon--muted"
      />
    );
  }

  return (
    <DocumentIcon
      size={16}
      className="mention-menu__icon mention-menu__icon--muted"
    />
  );
}
