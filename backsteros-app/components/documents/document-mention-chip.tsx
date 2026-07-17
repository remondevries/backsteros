"use client";

import { TrashIcon } from "@primer/octicons-react";
import Link from "next/link";
import { useMemo } from "react";

import { AssigneeContactIcon } from "@/components/contacts/assignee-contact-icon";
import { OrganizationIcon } from "@/components/icons/organization-icon";
import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "@/components/project-icon";
import { ProjectStatusIcon } from "@/components/project-status";
import { TaskPriorityIcon } from "@/components/task-priority";
import { TaskStatusIcon } from "@/components/task-status";
import { TaskDueDateIcon } from "@/components/tasks/task-due-date-icon";
import { getDeletedMentionDisplay } from "@/lib/documents/mentions/deleted-mention-display";
import type { MentionChipLayout } from "@/lib/documents/mentions/mention-layout";
import type {
  MentionCatalog,
  ParsedMentionToken,
} from "@/lib/documents/mentions/mention-menu-types";
import {
  resolveMentionCatalogContact,
  resolveMentionCatalogDocument,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogProject,
  resolveMentionCatalogTask,
} from "@/lib/documents/mentions/resolve-catalog-entry";
import {
  parseMentionToken,
  resolveMentionHref,
} from "@/lib/documents/mentions/tokens";
import { getProjectAreaLabel, type ProjectArea } from "@/lib/project-areas";
import type { ProjectStatus } from "@/lib/project-status";
import {
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "@/lib/task-due-date";
import type { TaskPriority } from "@/lib/task-priority";
import type { TaskStatus } from "@/lib/task-status";

import { DocumentMentionHoverCard } from "./document-mention-hover-card";
import { DocumentOcticon } from "./document-octicon";
import { MentionChipHoverShell } from "./mention-chip-shell";
import {
  getMentionChipLinkClass,
  getMentionChipTitleClass,
  MENTION_CHIP_DELETED_MODIFIER_CLASS,
  MENTION_CHIP_ICON_CLASS,
  MENTION_CHIP_IDENTIFIER_CLASS,
} from "./mention-chip-ui";

type DocumentMentionChipProps = {
  raw: string;
  catalog: MentionCatalog;
  layout?: MentionChipLayout;
};

function TaskMentionChipTrigger({
  href,
  displayId,
  title,
  status,
  priority,
  layout,
  projectName,
  projectIcon,
  dueDate,
}: {
  href: string;
  displayId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  layout: MentionChipLayout;
  projectName: string | null;
  projectIcon: string | null;
  dueDate: number | null;
}) {
  const dueDateLabel =
    layout === "block" && dueDate != null
      ? formatTaskDueMetaLabel(dueDate)
      : null;

  return (
    <Link href={href} className={getMentionChipLinkClass(layout)}>
      {layout === "block" ? (
        <TaskPriorityIcon
          priority={priority}
          size={14}
          className="shrink-0 self-center"
        />
      ) : null}
      <TaskStatusIcon status={status} className={MENTION_CHIP_ICON_CLASS} />
      <span className={MENTION_CHIP_IDENTIFIER_CLASS}>{displayId}</span>
      <span className={getMentionChipTitleClass(layout)}>{title}</span>
      {dueDateLabel ? (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-white/10 bg-transparent px-2 py-0.5 text-xs leading-none text-foreground/60">
          <TaskDueDateIcon
            active
            urgency={getTaskDueDateUrgency(dueDate, new Date(), { status })}
            size={12}
            className="shrink-0 text-foreground/50"
          />
          <span>{dueDateLabel}</span>
        </span>
      ) : null}
      {layout === "block" && projectName ? (
        <span className="inline-flex max-w-[8rem] shrink-0 items-center gap-1 text-xs leading-none text-foreground/50">
          <ProjectOcticon
            icon={getDisplayProjectIcon(projectIcon)}
            size={12}
            className="shrink-0 text-foreground/70"
          />
          <span className="truncate">{projectName}</span>
        </span>
      ) : null}
    </Link>
  );
}

function ProjectMentionChipTrigger({
  href,
  name,
  icon,
  projectKey,
  area,
  status,
  layout,
}: {
  href: string;
  name: string;
  icon: string | null;
  projectKey: string;
  area: ProjectArea | null;
  status: ProjectStatus;
  layout: MentionChipLayout;
}) {
  if (layout === "inline") {
    return (
      <Link href={href} className={getMentionChipLinkClass("inline")}>
        <ProjectOcticon
          icon={getDisplayProjectIcon(icon)}
          className={MENTION_CHIP_ICON_CLASS}
        />
        <span className={getMentionChipTitleClass("inline")}>{name}</span>
      </Link>
    );
  }

  return (
    <Link href={href} className={getMentionChipLinkClass("block")}>
      <ProjectOcticon
        icon={getDisplayProjectIcon(icon)}
        size={14}
        className="shrink-0 text-foreground/70"
      />
      <span className="shrink-0 font-mono text-xs tabular-nums text-foreground/45">
        {projectKey}
      </span>
      <ProjectStatusIcon status={status} size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium leading-[18px]">
        {name}
      </span>
      {area ? (
        <span className="shrink-0 text-xs leading-none text-foreground/50">
          {getProjectAreaLabel(area)}
        </span>
      ) : null}
    </Link>
  );
}

function DeletedMentionIcon({ className }: { className?: string }) {
  return (
    <TrashIcon
      size={14}
      className={className ?? MENTION_CHIP_ICON_CLASS}
      aria-hidden="true"
    />
  );
}

function DeletedMentionChipTrigger({
  parsed,
  layout,
}: {
  parsed: ParsedMentionToken;
  layout: MentionChipLayout;
}) {
  const display = getDeletedMentionDisplay(parsed);
  const chipLayout =
    parsed.kind === "task" || parsed.kind === "project" ? layout : "inline";

  if (parsed.kind === "project" && chipLayout === "block") {
    return (
      <span
        className={`${getMentionChipLinkClass("block")} ${MENTION_CHIP_DELETED_MODIFIER_CLASS}`}
        aria-label={`Deleted project ${display.ariaLabel}`}
        title="Deleted"
      >
        <DeletedMentionIcon className="shrink-0 text-foreground/70" />
        <span className="shrink-0 font-mono text-xs tabular-nums text-foreground/45">
          {display.identifier}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium leading-[18px] text-foreground/55">
          {display.title}
        </span>
        <span className="shrink-0 text-xs leading-none text-foreground/40">
          Deleted
        </span>
      </span>
    );
  }

  if (parsed.kind === "task" && chipLayout === "block") {
    return (
      <span
        className={`${getMentionChipLinkClass("block")} ${MENTION_CHIP_DELETED_MODIFIER_CLASS}`}
        aria-label={`Deleted task ${display.ariaLabel}`}
        title="Deleted"
      >
        <DeletedMentionIcon className="shrink-0 self-center" />
        <span className={MENTION_CHIP_IDENTIFIER_CLASS}>{display.identifier}</span>
        <span className={getMentionChipTitleClass("block")}>{display.title}</span>
        <span className="shrink-0 text-xs leading-none text-foreground/40">
          Deleted
        </span>
      </span>
    );
  }

  return (
    <span
      className={`${getMentionChipLinkClass("inline")} ${MENTION_CHIP_DELETED_MODIFIER_CLASS}`}
      aria-label={`Deleted ${parsed.kind} ${display.ariaLabel}`}
      title="Deleted"
    >
      <DeletedMentionIcon />
      {display.identifier ? (
        <span className={MENTION_CHIP_IDENTIFIER_CLASS}>{display.identifier}</span>
      ) : null}
      <span className={getMentionChipTitleClass("inline")}>{display.title}</span>
    </span>
  );
}

function DocumentMentionChipTrigger({
  href,
  title,
  icon,
}: {
  href: string;
  title: string;
  icon: string | null;
}) {
  return (
    <Link href={href} className={getMentionChipLinkClass("inline")}>
      <DocumentOcticon icon={icon} size={14} className={MENTION_CHIP_ICON_CLASS} />
      <span className={getMentionChipTitleClass("inline")}>{title}</span>
    </Link>
  );
}

function ContactMentionChipTrigger({
  href,
  name,
  contact,
}: {
  href: string;
  name: string;
  contact: {
    id: string;
    avatarStorageKey: string | null;
    avatarUpdatedAt: number;
  };
}) {
  return (
    <Link href={href} className={getMentionChipLinkClass("inline")}>
      <span className={`${MENTION_CHIP_ICON_CLASS} overflow-hidden rounded-full`}>
        <AssigneeContactIcon contact={contact} size={14} />
      </span>
      <span className={getMentionChipTitleClass("inline")}>{name}</span>
    </Link>
  );
}

function OrganizationMentionChipTrigger({
  href,
  name,
}: {
  href: string;
  name: string;
}) {
  return (
    <Link href={href} className={getMentionChipLinkClass("inline")}>
      <OrganizationIcon size={14} className={MENTION_CHIP_ICON_CLASS} />
      <span className={getMentionChipTitleClass("inline")}>{name}</span>
    </Link>
  );
}

export function DocumentMentionChip({
  raw,
  catalog,
  layout = "inline",
}: DocumentMentionChipProps) {
  const parsed = useMemo(() => parseMentionToken(raw), [raw]);
  const href = useMemo(
    () => (parsed ? resolveMentionHref(parsed, catalog) : null),
    [parsed, catalog],
  );

  const trigger = useMemo(() => {
    if (!parsed) {
      return null;
    }

    switch (parsed.kind) {
      case "task": {
        const task = resolveMentionCatalogTask(parsed, catalog);
        if (!task) {
          return <DeletedMentionChipTrigger parsed={parsed} layout={layout} />;
        }
        if (!href) {
          return null;
        }

        return (
          <TaskMentionChipTrigger
            href={href}
            displayId={task.displayId}
            title={task.title}
            status={task.status}
            priority={task.priority}
            layout={layout}
            projectName={task.projectName}
            projectIcon={task.projectIcon}
            dueDate={task.dueDate}
          />
        );
      }
      case "project": {
        const project = resolveMentionCatalogProject(parsed, catalog);
        if (!project) {
          return <DeletedMentionChipTrigger parsed={parsed} layout={layout} />;
        }
        if (!href) {
          return null;
        }

        return (
          <ProjectMentionChipTrigger
            href={href}
            name={project.name}
            icon={project.icon}
            projectKey={project.key}
            area={project.area}
            status={project.status}
            layout={layout}
          />
        );
      }
      case "contact": {
        const contact = resolveMentionCatalogContact(parsed, catalog);
        if (!contact) {
          return <DeletedMentionChipTrigger parsed={parsed} layout={layout} />;
        }
        if (!href) {
          return null;
        }

        return (
          <ContactMentionChipTrigger
            href={href}
            name={contact.name}
            contact={{
              id: contact.id,
              avatarStorageKey: contact.avatarStorageKey,
              avatarUpdatedAt: contact.avatarUpdatedAt,
            }}
          />
        );
      }
      case "organization": {
        const organization = resolveMentionCatalogOrganization(parsed, catalog);
        if (!organization) {
          return <DeletedMentionChipTrigger parsed={parsed} layout={layout} />;
        }
        if (!href) {
          return null;
        }

        return (
          <OrganizationMentionChipTrigger
            href={href}
            name={organization.name}
          />
        );
      }
      case "document": {
        const document = resolveMentionCatalogDocument(parsed, catalog);
        if (!document) {
          return <DeletedMentionChipTrigger parsed={parsed} layout={layout} />;
        }
        if (!href) {
          return null;
        }

        return (
          <DocumentMentionChipTrigger
            href={href}
            title={document.title}
            icon={document.icon}
          />
        );
      }
    }
  }, [catalog, href, layout, parsed]);

  if (!parsed || !trigger) {
    return (
      <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.9em] text-foreground/80">
        {raw}
      </code>
    );
  }

  const chipLayout =
    parsed.kind === "task" || parsed.kind === "project" ? layout : "inline";

  return (
    <MentionChipHoverShell
      layout={chipLayout}
      trigger={trigger}
      hoverContent={
        <DocumentMentionHoverCard parsed={parsed} catalog={catalog} />
      }
    />
  );
}

export function MentionLeadingIcon({
  kind,
  status,
  projectIcon,
  documentIcon,
  contact,
}: {
  kind: "task" | "project" | "contact" | "organization" | "document";
  status?: TaskStatus | null;
  projectIcon?: string | null;
  documentIcon?: string | null;
  contact?: {
    id: string;
    avatarStorageKey: string | null;
    avatarUpdatedAt: number;
  } | null;
}) {
  if (kind === "task" && status) {
    return <TaskStatusIcon status={status} className="size-4 shrink-0" />;
  }

  if (kind === "project") {
    return (
      <ProjectOcticon
        icon={getDisplayProjectIcon(projectIcon)}
        className="size-4 shrink-0 text-foreground/60"
      />
    );
  }

  if (kind === "contact") {
    return (
      <span className="size-4 shrink-0 overflow-hidden rounded-full">
        <AssigneeContactIcon contact={contact ?? null} size={16} />
      </span>
    );
  }

  if (kind === "organization") {
    return (
      <OrganizationIcon size={16} className="size-4 shrink-0 text-foreground/60" />
    );
  }

  return (
    <DocumentOcticon
      icon={documentIcon}
      size={16}
      className="size-4 shrink-0 text-foreground/60"
    />
  );
}
