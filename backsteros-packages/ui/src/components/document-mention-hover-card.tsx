"use client";

import { TrashIcon } from "@primer/octicons-react";

import { getDeletedMentionDisplay } from "../mentions/deleted-mention-display.js";
import {
  resolveMentionCatalogContact,
  resolveMentionCatalogDocument,
  resolveMentionCatalogLetter,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogProject,
  resolveMentionCatalogTask,
} from "../mentions/resolve-catalog-entry.js";
import type {
  MentionCatalog,
  MentionCatalogContact,
  MentionCatalogDocument,
  MentionCatalogLetter,
  MentionCatalogOrganization,
  MentionCatalogProject,
  MentionCatalogTask,
} from "../mentions/mention-menu-types.js";
import type { ParsedMentionToken } from "../mention-tokens.js";
import { formatTaskDueMetaLabel } from "../task-due-date.js";
import { getTaskPriorityLabel } from "../task-priority.js";
import { getTaskStatusLabel } from "../task-status.js";
import { getProjectStatusLabel } from "../project-status.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { DocumentIcon } from "./document-icon.js";
import { LetterIcon } from "./letter-icon.js";
import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "./project-octicon.js";
import { OrganizationIcon } from "./organization-icon.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";
import {
  MentionHoverCardSeparator,
  MentionHoverDescription,
  MentionHoverFooterRow,
  MentionHoverHeader,
  MentionHoverInline,
  MentionHoverMetaRow,
  MentionHoverPanel,
  MentionHoverSection,
  MentionHoverStatusRow,
  MentionHoverTitle,
} from "./mention-hover-card-ui.js";

export type DocumentMentionHoverCardProps = {
  parsed: ParsedMentionToken;
  catalog: MentionCatalog;
};

function formatUpdatedAtLabel(updatedAt: number): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function MentionHoverDeletedPanel({ parsed }: { parsed: ParsedMentionToken }) {
  const display = getDeletedMentionDisplay(parsed);
  const kindLabel =
    parsed.kind === "task"
      ? "Task"
      : parsed.kind === "letter"
        ? "Letter"
        : parsed.kind === "project"
          ? "Project"
          : parsed.kind === "contact"
            ? "Contact"
            : parsed.kind === "organization"
              ? "Organization"
              : "Document";

  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <TrashIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__muted-strong">
          Deleted {kindLabel.toLowerCase()}
        </span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{display.title}</MentionHoverTitle>
      {display.subtitle ? (
        <MentionHoverDescription clamp={2} mono>
          {display.subtitle}
        </MentionHoverDescription>
      ) : display.identifier && display.identifier !== display.title ? (
        <MentionHoverDescription clamp={2} mono>
          {display.identifier}
        </MentionHoverDescription>
      ) : null}
      <MentionHoverFooterRow>
        <span>
          This {kindLabel.toLowerCase()} is no longer in your workspace.
        </span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function TaskMentionHoverDetails({ task }: { task: MentionCatalogTask }) {
  const dueLabel = formatTaskDueMetaLabel(task.dueDate);
  const priorityLabel = getTaskPriorityLabel(task.priority);
  const statusLabel = getTaskStatusLabel(task.status);

  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <span className="mention-hover-card__id">{task.displayId}</span>
        {task.projectName ? (
          <>
            <span className="mention-hover-card__dot" aria-hidden="true">
              ·
            </span>
            <span className="mention-hover-card__truncate">
              {task.projectName}
            </span>
          </>
        ) : null}
      </MentionHoverMetaRow>
      <MentionHoverTitle>{task.title}</MentionHoverTitle>
      {task.description ? (
        <MentionHoverDescription>{task.description}</MentionHoverDescription>
      ) : null}
      <MentionHoverStatusRow>
        <TaskStatusIcon
          status={task.status}
          className="mention-hover-card__icon"
        />
        <span>{statusLabel}</span>
      </MentionHoverStatusRow>
      <MentionHoverFooterRow>
        <MentionHoverInline>
          <TaskPriorityIcon priority={task.priority} size={14} />
          <span>{priorityLabel}</span>
        </MentionHoverInline>
        <span>{dueLabel ? `Due ${dueLabel}` : "No due date"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function LetterMentionHoverDetails({ letter }: { letter: MentionCatalogLetter }) {
  const dueLabel = formatTaskDueMetaLabel(letter.dueDate);
  const statusLabel = getTaskStatusLabel(letter.status);

  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <LetterIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__id">{letter.displayId}</span>
        {letter.projectName ? (
          <>
            <span className="mention-hover-card__dot" aria-hidden="true">
              ·
            </span>
            <span className="mention-hover-card__truncate">
              {letter.projectName}
            </span>
          </>
        ) : null}
      </MentionHoverMetaRow>
      <MentionHoverTitle>{letter.title}</MentionHoverTitle>
      <MentionHoverStatusRow>
        <TaskStatusIcon
          status={letter.status}
          className="mention-hover-card__icon"
        />
        <span>{statusLabel}</span>
      </MentionHoverStatusRow>
      <MentionHoverFooterRow>
        <span>{dueLabel ? `Due ${dueLabel}` : "No due date"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function ProjectMentionHoverDetails({
  project,
}: {
  project: MentionCatalogProject;
}) {
  return (
    <MentionHoverPanel variant="structured">
      <MentionHoverHeader
        icon={
          <ProjectOcticon
            icon={getDisplayProjectIcon(project.icon)}
            className="mention-hover-card__icon mention-hover-card__icon--header"
          />
        }
        title={project.name}
      />
      <MentionHoverCardSeparator />
      {project.summary ? (
        <>
          <MentionHoverSection>
            <MentionHoverDescription>{project.summary}</MentionHoverDescription>
          </MentionHoverSection>
          <MentionHoverCardSeparator />
        </>
      ) : null}
      <MentionHoverSection>
        <MentionHoverFooterRow>
          <span>{getProjectStatusLabel(project.status)}</span>
          <span className="mention-hover-card__id">{project.key}</span>
        </MentionHoverFooterRow>
      </MentionHoverSection>
    </MentionHoverPanel>
  );
}

function DocumentMentionHoverDetails({
  document,
}: {
  document: MentionCatalogDocument;
}) {
  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <DocumentIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__truncate">
          {document.projectName}
        </span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{document.title}</MentionHoverTitle>
      <MentionHoverDescription clamp={2} mono>
        {document.projectKey}/{document.relativePath}
      </MentionHoverDescription>
      <MentionHoverFooterRow>
        <span>Updated {formatUpdatedAtLabel(document.updatedAt)}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function ContactMentionHoverDetails({
  contact,
}: {
  contact: MentionCatalogContact;
}) {
  return (
    <MentionHoverPanel variant="structured">
      <MentionHoverHeader
        icon={
          <span className="mention-hover-card__avatar">
            <ContactPersonIcon size={16} />
          </span>
        }
        title={contact.name}
      />
      <MentionHoverCardSeparator />
      {contact.summary ? (
        <>
          <MentionHoverSection>
            <MentionHoverDescription>{contact.summary}</MentionHoverDescription>
          </MentionHoverSection>
          <MentionHoverCardSeparator />
        </>
      ) : null}
      <MentionHoverSection>
        <MentionHoverFooterRow>
          <span className="mention-hover-card__truncate">
            {contact.title ?? contact.email ?? "Contact"}
          </span>
          <span className="mention-hover-card__id">{contact.key}</span>
        </MentionHoverFooterRow>
      </MentionHoverSection>
    </MentionHoverPanel>
  );
}

function OrganizationMentionHoverDetails({
  organization,
}: {
  organization: MentionCatalogOrganization;
}) {
  return (
    <MentionHoverPanel variant="structured">
      <MentionHoverHeader
        icon={
          <OrganizationIcon
            size={16}
            className="mention-hover-card__icon mention-hover-card__icon--header"
          />
        }
        title={organization.name}
      />
      <MentionHoverCardSeparator />
      {organization.summary ? (
        <>
          <MentionHoverSection>
            <MentionHoverDescription>
              {organization.summary}
            </MentionHoverDescription>
          </MentionHoverSection>
          <MentionHoverCardSeparator />
        </>
      ) : null}
      <MentionHoverSection>
        <MentionHoverFooterRow>
          <span className="mention-hover-card__truncate">
            {organization.email ?? "Organization"}
          </span>
          <span className="mention-hover-card__id">{organization.key}</span>
        </MentionHoverFooterRow>
      </MentionHoverSection>
    </MentionHoverPanel>
  );
}

export function DocumentMentionHoverCard({
  parsed,
  catalog,
}: DocumentMentionHoverCardProps) {
  switch (parsed.kind) {
    case "task": {
      const task = resolveMentionCatalogTask(parsed, catalog);
      if (!task) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <TaskMentionHoverDetails task={task} />;
    }
    case "letter": {
      const letter = resolveMentionCatalogLetter(parsed, catalog);
      if (!letter) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <LetterMentionHoverDetails letter={letter} />;
    }
    case "project": {
      const project = resolveMentionCatalogProject(parsed, catalog);
      if (!project) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <ProjectMentionHoverDetails project={project} />;
    }
    case "contact": {
      const contact = resolveMentionCatalogContact(parsed, catalog);
      if (!contact) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <ContactMentionHoverDetails contact={contact} />;
    }
    case "organization": {
      const organization = resolveMentionCatalogOrganization(parsed, catalog);
      if (!organization) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <OrganizationMentionHoverDetails organization={organization} />;
    }
    case "document": {
      const document = resolveMentionCatalogDocument(parsed, catalog);
      if (!document) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <DocumentMentionHoverDetails document={document} />;
    }
  }
}
