"use client";

import {
  OverviewNameEditor,
  ProjectOverviewIcon,
} from "@backsteros/ui";
import { Fragment, type ReactNode } from "react";

export type ConsoleBreadcrumbCrumb = {
  label: string;
  title?: string;
  /** Compact id style (e.g. #42, TASK-1). */
  emphasis?: "id";
  onNavigate?: () => void;
};

export type ConsoleProjectBreadcrumbHeaderProps = {
  projectIcon?: string | null;
  projectName: string;
  /**
   * Path crumbs after the project name.
   * Prefer this for multi-step paths (PR → tab → commit/file).
   */
  crumbs?: ConsoleBreadcrumbCrumb[] | null;
  /** Trailing crumb after the project (task id, commit title, PR title). */
  segment?: string | null;
  /** Optional crumb after `segment` (e.g. task title on inbox). */
  titleSegment?: string | null;
  /** Leading crumb before the project (e.g. "Inbox"). */
  rootLabel?: string | null;
  onNavigateRoot?: () => void;
  /** When set with a segment, project name navigates back. */
  onNavigateToProject?: () => void;
  /** Editable project name (overview). Ignored when a segment is shown. */
  onSaveProjectName?: (
    name: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onIconChange?: (icon: string | null) => void | Promise<void>;
  /** Reset key for the name editor (usually project id). */
  projectId?: string;
  /** Optional control before the icon (e.g. back chevron). */
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

function resolveCrumbs({
  crumbs,
  segment,
  titleSegment,
}: {
  crumbs?: ConsoleBreadcrumbCrumb[] | null;
  segment?: string | null;
  titleSegment?: string | null;
}): ConsoleBreadcrumbCrumb[] {
  if (crumbs && crumbs.length > 0) {
    return crumbs
      .map((crumb) => ({
        ...crumb,
        label: crumb.label.trim(),
      }))
      .filter((crumb) => crumb.label.length > 0);
  }

  const trimmedSegment = segment?.trim() || null;
  const trimmedTitle = titleSegment?.trim() || null;
  const resolved: ConsoleBreadcrumbCrumb[] = [];
  if (trimmedSegment) {
    resolved.push({
      label: trimmedSegment,
      emphasis: trimmedTitle ? "id" : undefined,
    });
  }
  if (trimmedTitle) {
    resolved.push({ label: trimmedTitle });
  }
  return resolved;
}

/**
 * Stable pane chrome: project icon + name, with optional path crumbs
 * for task / commit / PR detail without swapping the whole titlebar.
 * Inbox adds an optional root crumb:
 * `Inbox / Project / TASK-1 / Title`.
 * PR detail: `Project / #42 / Conversation` (+ commit or file).
 */
export function ConsoleProjectBreadcrumbHeader({
  projectIcon,
  projectName,
  crumbs = null,
  segment = null,
  titleSegment = null,
  rootLabel = null,
  onNavigateRoot,
  onNavigateToProject,
  onSaveProjectName,
  onIconChange,
  projectId,
  leading,
  actions,
  className,
}: ConsoleProjectBreadcrumbHeaderProps) {
  const resolvedCrumbs = resolveCrumbs({ crumbs, segment, titleSegment });
  const trimmedRoot = rootLabel?.trim() || null;
  const showCrumbs = resolvedCrumbs.length > 0;
  const showRoot = Boolean(trimmedRoot);
  const projectClickable = showCrumbs && Boolean(onNavigateToProject);
  const rootClickable = showRoot && Boolean(onNavigateRoot);
  const showNav = showRoot || showCrumbs;

  return (
    <div
      className={["console-pane-header", className].filter(Boolean).join(" ")}
    >
      <div className="console-pane-header-title console-project-breadcrumb">
        {leading}
        {showNav ? (
          <nav
            className="console-project-breadcrumb-nav"
            aria-label="Location"
          >
            {showRoot ? (
              <>
                {rootClickable ? (
                  <button
                    type="button"
                    className="console-project-breadcrumb-project"
                    title={trimmedRoot ?? undefined}
                    onClick={onNavigateRoot}
                  >
                    {trimmedRoot}
                  </button>
                ) : (
                  <span
                    className="console-project-breadcrumb-project is-static"
                    title={trimmedRoot ?? undefined}
                  >
                    {trimmedRoot}
                  </span>
                )}
                <span
                  className="console-project-breadcrumb-sep"
                  aria-hidden="true"
                >
                  /
                </span>
              </>
            ) : null}
            <span className="console-project-breadcrumb-project-wrap">
              <ProjectOverviewIcon
                icon={projectIcon}
                name={projectName}
                size={14}
                variant="bare"
                onIconChange={onIconChange}
              />
              {showCrumbs ? (
                projectClickable ? (
                  <button
                    type="button"
                    className="console-project-breadcrumb-project"
                    title={projectName}
                    onClick={onNavigateToProject}
                  >
                    {projectName}
                  </button>
                ) : (
                  <span
                    className="console-project-breadcrumb-project is-static"
                    title={projectName}
                  >
                    {projectName}
                  </span>
                )
              ) : (
                <span
                  className="console-project-breadcrumb-project is-static"
                  title={projectName}
                >
                  {projectName}
                </span>
              )}
            </span>
            {resolvedCrumbs.map((crumb, index) => {
              const isLast = index === resolvedCrumbs.length - 1;
              const clickable = Boolean(crumb.onNavigate) && !isLast;
              const crumbClassName = [
                "console-project-breadcrumb-segment",
                crumb.emphasis === "id"
                  ? "console-project-breadcrumb-segment--id"
                  : null,
                clickable ? "is-clickable" : null,
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  <span
                    className="console-project-breadcrumb-sep"
                    aria-hidden="true"
                  >
                    /
                  </span>
                  {clickable ? (
                    <button
                      type="button"
                      className={crumbClassName}
                      title={crumb.title ?? crumb.label}
                      onClick={crumb.onNavigate}
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span
                      className={crumbClassName}
                      aria-current={isLast ? "page" : undefined}
                      title={crumb.title ?? crumb.label}
                    >
                      {crumb.label}
                    </span>
                  )}
                </Fragment>
              );
            })}
          </nav>
        ) : (
          <>
            <ProjectOverviewIcon
              icon={projectIcon}
              name={projectName}
              size={14}
              variant="bare"
              onIconChange={onIconChange}
            />
            {onSaveProjectName ? (
              <OverviewNameEditor
                value={projectName}
                entityLabel="Project"
                resetKey={projectId ?? projectName}
                titleClassName="console-project-pane-name"
                onSave={onSaveProjectName}
              />
            ) : (
              <span className="console-project-pane-name" title={projectName}>
                {projectName}
              </span>
            )}
          </>
        )}
      </div>
      {actions}
    </div>
  );
}
