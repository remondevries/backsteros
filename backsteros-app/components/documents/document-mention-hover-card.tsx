"use client";

import { TrashIcon } from "@primer/octicons-react";

import { AssigneeContactIcon } from "@/components/contacts/assignee-contact-icon";
import { OrganizationIcon } from "@/components/icons/organization-icon";
import { LetterIcon } from "@/components/letters/letter-icon";
import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "@/components/project-icon";
import { TaskPriorityIcon } from "@/components/task-priority";
import { TaskStatusIcon } from "@/components/task-status";
import type {
  MentionCatalog,
  MentionCatalogContact,
  MentionCatalogDocument,
  MentionCatalogLetter,
  MentionCatalogOrganization,
  MentionCatalogProject,
  MentionCatalogTask,
  ParsedMentionToken,
} from "@/lib/documents/mentions/mention-menu-types";
import {
  resolveMentionCatalogContact,
  resolveMentionCatalogDocument,
  resolveMentionCatalogLetter,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogProject,
  resolveMentionCatalogTask,
} from "@/lib/documents/mentions/resolve-catalog-entry";
import { getDeletedMentionDisplay } from "@/lib/documents/mentions/deleted-mention-display";
import { getProjectStatusLabel } from "@/lib/project-status";
import { formatTaskDueMetaLabel } from "@/lib/task-due-date";
import { getTaskPriorityLabel } from "@/lib/task-priority";
import { getTaskStatusLabel } from "@/lib/task-status";

import { DocumentOcticon } from "./document-octicon";
import {
  MentionHoverCardSeparator,
  MentionHoverFooterRow,
  MentionHoverHeader,
  MentionHoverMetaRow,
  MentionHoverPanel,
  MentionHoverSection,
  MentionHoverTitle,
} from "./mention-chip-ui";

type DocumentMentionHoverCardProps = {
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
        <TrashIcon size={14} className="size-3.5 shrink-0 text-foreground/45" />
        <span className="text-foreground/70">Deleted {kindLabel.toLowerCase()}</span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{display.title}</MentionHoverTitle>
      {display.subtitle ? (
        <p className="line-clamp-2 font-mono text-xs leading-snug text-foreground/45">
          {display.subtitle}
        </p>
      ) : display.identifier && display.identifier !== display.title ? (
        <p className="font-mono text-xs leading-snug text-foreground/45">
          {display.identifier}
        </p>
      ) : null}
      <MentionHoverFooterRow>
        <span>This {kindLabel.toLowerCase()} is no longer in your workspace.</span>
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
        <span className="font-mono font-medium text-foreground/70">
          {task.displayId}
        </span>
        {task.projectName ? (
          <>
            <span className="text-foreground/30">·</span>
            <span className="truncate">{task.projectName}</span>
          </>
        ) : null}
      </MentionHoverMetaRow>
      <MentionHoverTitle>{task.title}</MentionHoverTitle>
      {task.description ? (
        <p className="line-clamp-3 text-xs leading-snug text-foreground/55">
          {task.description}
        </p>
      ) : null}
      <div className="mt-1 flex items-center gap-2 text-xs">
        <TaskStatusIcon status={task.status} className="size-3.5 shrink-0" />
        <span className="text-foreground">{statusLabel}</span>
      </div>
      <MentionHoverFooterRow>
        <span className="inline-flex items-center gap-1.5">
          <TaskPriorityIcon priority={task.priority} size={14} />
          <span>{priorityLabel}</span>
        </span>
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
        <LetterIcon size={14} className="size-3.5 shrink-0 text-foreground/60" />
        <span className="font-mono font-medium text-foreground/70">
          {letter.displayId}
        </span>
        {letter.projectName ? (
          <>
            <span className="text-foreground/30">·</span>
            <span className="truncate">{letter.projectName}</span>
          </>
        ) : null}
      </MentionHoverMetaRow>
      <MentionHoverTitle>{letter.title}</MentionHoverTitle>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <TaskStatusIcon status={letter.status} className="size-3.5 shrink-0" />
        <span className="text-foreground">{statusLabel}</span>
      </div>
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
            className="size-4 shrink-0 text-foreground/60"
          />
        }
        title={project.name}
      />
      <MentionHoverCardSeparator />
      {project.summary ? (
        <>
          <MentionHoverSection>
            <p className="line-clamp-3 text-xs leading-snug text-foreground/55">
              {project.summary}
            </p>
          </MentionHoverSection>
          <MentionHoverCardSeparator />
        </>
      ) : null}
      <MentionHoverSection>
        <MentionHoverFooterRow>
          <span className="text-foreground">
            {getProjectStatusLabel(project.status)}
          </span>
          <span className="font-mono text-foreground/70">{project.key}</span>
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
        <DocumentOcticon
          icon={document.icon}
          size={14}
          className="size-3.5 shrink-0 text-foreground/60"
        />
        <span className="truncate">{document.projectName}</span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{document.title}</MentionHoverTitle>
      <p className="line-clamp-2 font-mono text-xs leading-snug text-foreground/45">
        {document.projectKey}/{document.relativePath}
      </p>
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
          <span className="size-4 shrink-0 overflow-hidden rounded-full">
            <AssigneeContactIcon
              contact={{
                id: contact.id,
                avatarStorageKey: contact.avatarStorageKey,
                avatarUpdatedAt: contact.avatarUpdatedAt,
              }}
              size={16}
            />
          </span>
        }
        title={contact.name}
      />
      <MentionHoverCardSeparator />
      {contact.summary ? (
        <>
          <MentionHoverSection>
            <p className="line-clamp-3 text-xs leading-snug text-foreground/55">
              {contact.summary}
            </p>
          </MentionHoverSection>
          <MentionHoverCardSeparator />
        </>
      ) : null}
      <MentionHoverSection>
        <MentionHoverFooterRow>
          <span className="truncate text-foreground">
            {contact.title ?? contact.email ?? "Contact"}
          </span>
          <span className="font-mono text-foreground/70">{contact.key}</span>
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
          <OrganizationIcon size={16} className="size-4 shrink-0 text-foreground/60" />
        }
        title={organization.name}
      />
      <MentionHoverCardSeparator />
      {organization.summary ? (
        <>
          <MentionHoverSection>
            <p className="line-clamp-3 text-xs leading-snug text-foreground/55">
              {organization.summary}
            </p>
          </MentionHoverSection>
          <MentionHoverCardSeparator />
        </>
      ) : null}
      <MentionHoverSection>
        <MentionHoverFooterRow>
          <span className="truncate text-foreground">
            {organization.email ?? "Organization"}
          </span>
          <span className="font-mono text-foreground/70">{organization.key}</span>
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
