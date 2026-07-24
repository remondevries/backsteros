"use client";

import {
  OverviewNameEditor,
  ProjectOverviewIcon,
} from "@backsteros/ui";
import type { ReactNode } from "react";

export type ConsoleProjectBreadcrumbHeaderProps = {
  projectIcon?: string | null;
  projectName: string;
  /** Trailing crumb after the project (task id, commit title, PR title). */
  segment?: string | null;
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

/**
 * Stable pane chrome: project icon + name, with an optional `/ segment`
 * for task / commit / PR detail without swapping the whole titlebar.
 */
export function ConsoleProjectBreadcrumbHeader({
  projectIcon,
  projectName,
  segment = null,
  onNavigateToProject,
  onSaveProjectName,
  onIconChange,
  projectId,
  leading,
  actions,
  className,
}: ConsoleProjectBreadcrumbHeaderProps) {
  const trimmedSegment = segment?.trim() || null;
  const showSegment = Boolean(trimmedSegment);
  const projectClickable = showSegment && Boolean(onNavigateToProject);

  return (
    <div
      className={["console-pane-header", className].filter(Boolean).join(" ")}
    >
      <div className="console-pane-header-title console-project-breadcrumb">
        {leading}
        <ProjectOverviewIcon
          icon={projectIcon}
          name={projectName}
          size={14}
          variant="bare"
          onIconChange={onIconChange}
        />
        {showSegment ? (
          <nav
            className="console-project-breadcrumb-nav"
            aria-label="Location"
          >
            {projectClickable ? (
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
            )}
            <span
              className="console-project-breadcrumb-sep"
              aria-hidden="true"
            >
              /
            </span>
            <span
              className="console-project-breadcrumb-segment"
              aria-current="page"
              title={trimmedSegment ?? undefined}
            >
              {trimmedSegment}
            </span>
          </nav>
        ) : onSaveProjectName ? (
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
      </div>
      {actions ? (
        <div className="console-pane-header-actions">{actions}</div>
      ) : null}
    </div>
  );
}
