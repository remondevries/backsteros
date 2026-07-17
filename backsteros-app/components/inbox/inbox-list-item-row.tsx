"use client";

import Link from "next/link";

import { InboxItemTypeIcon } from "@/components/inbox/inbox-item-type-icon";
import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "@/components/project-icon";
import { TaskDueDateDropdown } from "@/components/tasks/task-due-date-dropdown";
import {
  TaskListDueDateLabel,
  TaskListPriorityLabel,
} from "@/components/tasks/task-list-property-label";
import { TaskPriorityDropdown } from "@/components/tasks/task-priority-dropdown";
import {
  TaskProjectField,
  type AssignableProject,
} from "@/components/tasks/task-project-field";
import { useIsMobileUi } from "@/hooks/use-circle-platform";
import type { InboxListItem } from "@/lib/inbox/inbox-items";
import { sidePanelItemClass } from "@/lib/side-panel-styles";
import { keyboardNavItemProps } from "@/lib/shortcuts/keyboard-nav-item";
import { primeTabTitle } from "@/lib/tabs/primed-tab-title";

function stopFieldEvent(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function primeInboxTabTitle(href: string, title: string) {
  return () => {
    primeTabTitle(href, title);
  };
}

type InboxListItemRowProps = {
  item: InboxListItem;
  href: string;
  isSelected: boolean;
  keyboardHighlighted: boolean;
  assignableProjects?: AssignableProject[];
};

function InboxTaskProjectMeta({
  item,
  assignableProjects,
  interactive = true,
}: {
  item: Extract<InboxListItem, { kind: "task" }>;
  assignableProjects: AssignableProject[];
  interactive?: boolean;
}) {
  const hasProjectMeta = Boolean(
    item.projectId || item.projectName || item.projectKey,
  );

  if (!hasProjectMeta) {
    return null;
  }

  if (interactive && assignableProjects.length > 0 && item.projectId) {
    return (
      <span
        className="task-row__project inline-flex max-w-full min-w-0"
        onMouseDown={stopFieldEvent}
        onClick={stopFieldEvent}
      >
        <TaskProjectField
          variant="list"
          taskId={item.id}
          projectId={item.projectId}
          status={item.status}
          projects={assignableProjects}
        />
      </span>
    );
  }

  const projectLabel = item.projectName ?? item.projectKey;
  if (!projectLabel) {
    return null;
  }

  return (
    <span className="task-row__project inline-flex max-w-full min-w-0 items-center gap-1 text-xs leading-none">
      <ProjectOcticon
        icon={getDisplayProjectIcon(item.projectIcon)}
        size={12}
        className="shrink-0 text-foreground/70"
      />
      <span className="truncate">{projectLabel}</span>
    </span>
  );
}

function InboxLetterProjectMeta({
  item,
}: {
  item: Extract<InboxListItem, { kind: "letter" }>;
}) {
  if (!item.projectName && !item.projectKey) {
    return null;
  }

  return (
    <span className="task-row__project inline-flex max-w-full min-w-0 items-center gap-1 text-xs leading-none">
      <ProjectOcticon
        icon={getDisplayProjectIcon(item.projectIcon)}
        size={12}
        className="shrink-0 text-foreground/70"
      />
      <span className="truncate">{item.projectName ?? item.projectKey}</span>
    </span>
  );
}

export function InboxListItemRow({
  item,
  href,
  isSelected,
  keyboardHighlighted,
  assignableProjects = [],
}: InboxListItemRowProps) {
  const isMobileUi = useIsMobileUi();

  if (isMobileUi) {
    const typeIconSize = 18;

    if (item.kind === "letter") {
      const hasProjectMeta = Boolean(item.projectName ?? item.projectKey);

      return (
        <li key={item.id} className="w-full">
          <Link
            href={href}
            aria-current={isSelected ? "page" : undefined}
            className={`${sidePanelItemClass({
              active: isSelected,
              keyboardHighlighted,
            })} inbox-list-item-row--mobile w-full min-w-0 max-w-full overflow-hidden text-sm`}
            {...keyboardNavItemProps(item.id)}
            onPointerDown={primeInboxTabTitle(href, item.title)}
          >
            <div className="task-row__content min-w-0 flex-1">
              <div className="task-row__main min-w-0">
                <span className="task-row__status inline-flex shrink-0">
                  <InboxItemTypeIcon
                    kind="letter"
                    letterIcon={item.icon}
                    size={typeIconSize}
                  />
                </span>
                <span className="task-row__title min-w-0 flex-1 basis-0 truncate text-sm font-medium leading-[18px]">
                  {item.title}
                </span>
              </div>

              {hasProjectMeta ? (
                <div className="task-row__meta min-w-0">
                  <InboxLetterProjectMeta item={item} />
                </div>
              ) : null}
            </div>
          </Link>
        </li>
      );
    }

    const hasProjectMeta = Boolean(
      item.projectId || item.projectName || item.projectKey,
    );
    const hasDueMeta = item.dueDate != null;

    return (
      <li key={item.id} className="w-full">
        <Link
          href={href}
          aria-current={isSelected ? "page" : undefined}
          className={`${sidePanelItemClass({
            active: isSelected,
            keyboardHighlighted,
          })} inbox-list-item-row--mobile w-full min-w-0 max-w-full overflow-hidden text-sm`}
          {...keyboardNavItemProps(item.id)}
          onPointerDown={primeInboxTabTitle(href, item.title)}
        >
          <div className="task-row__content min-w-0 flex-1">
            <div className="task-row__main min-w-0">
              <span className="task-row__status inline-flex shrink-0">
                <InboxItemTypeIcon kind="task" size={typeIconSize} />
              </span>
              <span className="task-row__title min-w-0 flex-1 basis-0 truncate text-sm font-medium leading-[18px]">
                {item.title}
              </span>
            </div>

            <div className="task-row__meta min-w-0">
              <span className="task-row__priority inline-flex shrink-0">
                <TaskListPriorityLabel priority={item.priority} />
              </span>

              {hasDueMeta ? (
                <span className="task-row__due inline-flex shrink-0">
                  <TaskListDueDateLabel
                    dueDate={new Date(item.dueDate!)}
                    status={item.status}
                  />
                </span>
              ) : null}

              {hasProjectMeta ? (
                <InboxTaskProjectMeta
                  item={item}
                  assignableProjects={assignableProjects}
                  interactive={false}
                />
              ) : null}
            </div>
          </div>
        </Link>
      </li>
    );
  }

  if (item.kind === "letter") {
    const hasProject = Boolean(item.projectKey ?? item.projectName);

    return (
      <li key={item.id} className="w-full">
        <Link
          href={href}
          aria-current={isSelected ? "page" : undefined}
          className={`${sidePanelItemClass({
            active: isSelected,
            keyboardHighlighted,
            stacked: true,
          })} text-sm`}
          {...keyboardNavItemProps(item.id)}
          onPointerDown={primeInboxTabTitle(href, item.title)}
        >
          <div className="app-side-panel-item-row-primary">
            <InboxItemTypeIcon kind="letter" letterIcon={item.icon} />
            <span className="min-w-0 truncate font-medium">{item.title}</span>
          </div>
          {hasProject ? (
            <div className="app-side-panel-item-row-meta text-xs text-foreground/45">
              <InboxLetterProjectMeta item={item} />
            </div>
          ) : null}
        </Link>
      </li>
    );
  }

  const hasProjectMeta = Boolean(
    item.projectId || item.projectName || item.projectKey,
  );
  const hasDueMeta = item.dueDate != null;

  return (
    <li key={item.id} className="w-full">
      <div
        className={`${sidePanelItemClass({
          active: isSelected,
          keyboardHighlighted,
          stacked: true,
        })} text-sm`}
        {...keyboardNavItemProps(item.id)}
      >
        <Link
          href={href}
          aria-current={isSelected ? "page" : undefined}
          className="app-side-panel-item-row-primary text-inherit no-underline"
          scroll={false}
          onPointerDown={primeInboxTabTitle(href, item.title)}
        >
          <InboxItemTypeIcon kind="task" />
          <span className="min-w-0 truncate font-medium">{item.title}</span>
        </Link>
        <div
          className="app-side-panel-item-row-meta app-side-panel-item-row-meta-inbox text-xs text-foreground/45"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <span className="inline-flex shrink-0">
            <TaskPriorityDropdown
              taskId={item.id}
              projectId={item.projectId}
              priority={item.priority}
              variant="list"
            />
          </span>
          {hasDueMeta ? (
            <span className="inline-flex shrink-0">
              <TaskDueDateDropdown
                taskId={item.id}
                projectId={item.projectId}
                dueDate={
                  item.dueDate != null ? new Date(item.dueDate) : null
                }
                status={item.status}
                variant="list"
              />
            </span>
          ) : null}
          {hasProjectMeta ? (
            <span className="inline-flex max-w-full min-w-0 shrink-0">
              <InboxTaskProjectMeta
                item={item}
                assignableProjects={assignableProjects}
              />
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
