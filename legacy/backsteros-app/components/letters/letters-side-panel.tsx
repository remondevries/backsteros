"use client";

import type {
  Letter as ApiLetter,
  Project as ApiProject,
} from "@backsteros/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { LetterDisplayIdLabel } from "@/components/letters/letter-display-id-label";
import { LettersSidePanelSkeleton } from "@/components/letters/letter-detail-skeleton";
import { LetterOcticon } from "@/components/letters/letter-octicon";
import { ContentSidePanelHeader } from "@/components/shell/content-side-panel-header";
import { ContentSidePanelList } from "@/components/shell/content-side-panel-list";
import { SidePanelPlusIcon } from "@/components/shell/side-panel-plus-icon";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { TaskStatusGroupSection } from "@/components/tasks/task-status-group-section";
import { TaskStatusIcon } from "@/components/task-status";
import { useApiResource } from "@/lib/api-context";
import { normalizeLetter, normalizeProject } from "@/lib/entity-normalize";
import {
  getLettersHref,
  getProjectLetterHref,
  letterMatchesRouteSlug,
} from "@/lib/entity-route-hrefs";
import { encodeProjectSlug } from "@/lib/entity-slugs";
import { groupLettersByStatus } from "@/lib/letters/group-letters-by-status";
import {
  getSelectedLetterSlugFromPathname,
  isLetterComposePath,
  isProjectLettersSectionPath,
} from "@/lib/letters/navigation-path";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { keyboardNavItemProps } from "@/lib/shortcuts/keyboard-nav-item";
import { flattenGroupedListItemIds } from "@/lib/shortcuts/list-keyboard-nav-index";
import { LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL } from "@/lib/shortcuts/list-keyboard-nav-zone";
import { sidePanelItemClass } from "@/lib/side-panel-styles";
import { preferLocalOrApi } from "@/lib/sync/prefer-local-or-api";
import type { TaskStatus } from "@/lib/task-status";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

function getProjectRouteParamFromLettersPath(pathname: string): string | null {
  const standalone = pathname.match(/^\/projects\/([^/]+)\/letters(?:\/|$)/);
  if (standalone) {
    return decodeURIComponent(standalone[1]!);
  }

  const orgScoped = pathname.match(
    /^\/organizations\/[^/]+\/projects\/([^/]+)\/letters(?:\/|$)/,
  );
  if (orgScoped) {
    return decodeURIComponent(orgScoped[1]!);
  }

  return null;
}

function letterHref(
  letter: { number?: number | null; id: string },
  projectRouteParam: string | null,
): string {
  if (projectRouteParam && letter.number != null) {
    return getProjectLetterHref(projectRouteParam, letter.number);
  }
  if (letter.number != null) {
    return getLettersHref(letter.number);
  }
  return `/letters/${letter.id}`;
}

export function LettersSidePanel({ pathname }: { pathname: string }) {
  const router = useRouter();
  const listRef = useRef<HTMLElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  const selectedSlug = getSelectedLetterSlugFromPathname(pathname);
  const projectRouteParam = isProjectLettersSectionPath(pathname)
    ? getProjectRouteParamFromLettersPath(pathname)
    : null;

  const projectsResource = useApiResource<{ projects: ApiProject[] }>(
    (client) =>
      projectRouteParam
        ? client.requestJson("/api/v1/projects")
        : Promise.resolve({ projects: [] as ApiProject[] }),
    [projectRouteParam],
  );
  const localProjects = usePowerSyncQuery<Record<string, unknown>>(
    projectRouteParam
      ? "SELECT * FROM projects WHERE deleted_at IS NULL"
      : null,
  );

  const scopedProjectId = useMemo(() => {
    if (!projectRouteParam) return null;
    const projects = preferLocalOrApi(
      localProjects.data?.map((row) => snakeRow(row) as ApiProject),
      projectsResource.data?.projects,
    ).map(normalizeProject);
    const match = projects.find(
      (project) =>
        encodeProjectSlug(project.key) === projectRouteParam.toLowerCase(),
    );
    return match?.id ?? null;
  }, [localProjects.data, projectRouteParam, projectsResource.data]);

  const resource = useApiResource<{ letters: ApiLetter[] }>(
    (client) => {
      if (projectRouteParam && !scopedProjectId) {
        return Promise.resolve({ letters: [] as ApiLetter[] });
      }
      return scopedProjectId
        ? client.requestJson(
            `/api/v1/letters?projectId=${encodeURIComponent(scopedProjectId)}`,
          )
        : client.requestJson("/api/v1/letters");
    },
    [projectRouteParam, scopedProjectId],
  );

  const local = usePowerSyncQuery<Record<string, unknown>>(
    projectRouteParam && !scopedProjectId
      ? null
      : scopedProjectId
        ? "SELECT * FROM letters WHERE deleted_at IS NULL AND project_id = ? ORDER BY sort_order, updated_at DESC"
        : "SELECT * FROM letters WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC",
    scopedProjectId ? [scopedProjectId] : [],
  );

  const letters = useMemo(() => {
    const rows = preferLocalOrApi(
      local.data?.map((row) => snakeRow(row) as ApiLetter),
      resource.data?.letters,
    );
    return rows.map(normalizeLetter);
  }, [local.data, resource.data]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskStatus>>(
    () => new Set(),
  );

  const groups = useMemo(
    () =>
      groupLettersByStatus(letters).filter((group) => group.letters.length > 0),
    [letters],
  );

  const composeHref = scopedProjectId
    ? `/letters/new?projectId=${encodeURIComponent(scopedProjectId)}`
    : "/letters/new";
  const composeActive = isLetterComposePath(pathname);

  const selectedLetterId = useMemo(() => {
    if (!selectedSlug) return null;
    return (
      letters.find((letter) => letterMatchesRouteSlug(letter, selectedSlug))
        ?.id ?? null
    );
  }, [letters, selectedSlug]);

  const itemIds = flattenGroupedListItemIds(
    groups.map((group) => ({ key: group.status, items: group.letters })),
    collapsedGroups,
    (letter) => letter.id,
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedLetterId,
    onNavigate: (letterId) => {
      const letter = letters.find((entry) => entry.id === letterId);
      if (!letter) return;
      const href = letterHref(letter, projectRouteParam);
      if (href !== pathname) {
        router.push(href);
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: letters.length > 0,
  });

  return (
    <div className="app-content-side-panel app-content-side-panel--letters flex h-full min-h-0 flex-col">
      <ContentSidePanelHeader
        title="Letters"
        actions={
          <Link
            href={composeHref}
            className="app-side-panel-section-action"
            aria-label="Upload letter"
            aria-current={composeActive ? "page" : undefined}
          >
            <SidePanelPlusIcon />
          </Link>
        }
      />
      <div className="app-content-side-panel-main flex min-h-0 flex-1 flex-col">
        {resource.loading && !local.data && !letters.length ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
            <LettersSidePanelSkeleton />
          </div>
        ) : letters.length ? (
          <ContentSidePanelList
            ref={listRef}
            aria-label="Letters"
            {...listContainerProps}
          >
            {groups.map((group) => {
              const collapsed = collapsedGroups.has(group.status);

              return (
                <TaskStatusGroupSection
                  key={group.status}
                  groupKey={group.status}
                  title={group.label}
                  icon={
                    <TaskStatusIcon
                      status={group.status}
                      size={14}
                      title={group.label}
                    />
                  }
                  collapsed={collapsed}
                  onToggle={() =>
                    setCollapsedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(group.status)) next.delete(group.status);
                      else next.add(group.status);
                      return next;
                    })
                  }
                  onExpandGroup={() =>
                    setCollapsedGroups((current) => {
                      if (!current.has(group.status)) return current;
                      const next = new Set(current);
                      next.delete(group.status);
                      return next;
                    })
                  }
                >
                  {group.letters.map((letter) => {
                    const isActive = letterMatchesRouteSlug(
                      letter,
                      selectedSlug,
                    );
                    const href = letterHref(letter, projectRouteParam);

                    return (
                      <li key={letter.id}>
                        <Link
                          href={href}
                          scroll={false}
                          className={sidePanelItemClass({
                            active: isActive,
                            keyboardHighlighted: highlightedId === letter.id,
                          })}
                          aria-current={isActive ? "page" : undefined}
                          {...keyboardNavItemProps(letter.id)}
                        >
                          <span
                            className="app-side-panel-item-icon text-foreground/50"
                            aria-hidden="true"
                          >
                            <LetterOcticon
                              icon={letter.icon}
                              className="size-3.5 text-current"
                            />
                          </span>
                          <LetterDisplayIdLabel letter={letter} />
                          <span className="app-side-panel-item-label">
                            {letter.title}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </TaskStatusGroupSection>
              );
            })}
          </ContentSidePanelList>
        ) : null}
      </div>
    </div>
  );
}
