"use client";

import type { ReactNode } from "react";

import { ProjectLayoutBreadcrumb } from "@/components/projects/project-layout-breadcrumb";
import { ProjectNav } from "@/components/projects/project-nav";
import { LoadingList } from "@/components/ui/loading-list";

type ProjectSectionChromeProps = {
  projectRouteParam: string;
  /** Real project title; omit while loading to avoid flashing the route slug. */
  projectName?: string | null;
  /** When set, wait for organizationContext before registering breadcrumbs. */
  organizationRouteParam?: string;
  organizationContext?: {
    organizationRouteParam: string;
    organizationName: string;
  };
  /** When true, render a single content skeleton under the nav (keeps chrome stable). */
  loading?: boolean;
  /** Override the default generic loader (e.g. tasks list skeleton). */
  loadingFallback?: ReactNode;
  contentClassName?: string;
  children?: ReactNode;
};

/** Shared project section shell so tab switches keep nav visible with one content loader. */
export function ProjectSectionChrome({
  projectRouteParam,
  projectName,
  organizationRouteParam,
  organizationContext,
  loading = false,
  loadingFallback,
  contentClassName = "flex min-h-0 flex-1 flex-col overflow-hidden p-2",
  children,
}: ProjectSectionChromeProps) {
  const title = projectName?.trim() || null;
  const breadcrumbReady =
    Boolean(title) &&
    (!organizationRouteParam || Boolean(organizationContext));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {breadcrumbReady && title ? (
        <ProjectLayoutBreadcrumb
          projectRouteParam={projectRouteParam}
          projectName={title}
          organizationContext={organizationContext}
        />
      ) : null}
      <ProjectNav projectRouteParam={projectRouteParam} />
      <div className={contentClassName}>
        {loading ? (loadingFallback ?? <LoadingList />) : children}
      </div>
    </div>
  );
}
