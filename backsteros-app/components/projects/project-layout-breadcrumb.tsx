"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { RegisterBreadcrumbChrome } from "@/components/navigation/breadcrumb-chrome";
import { useProjectBreadcrumbItems } from "@/components/projects/project-breadcrumb-context";
import { useMounted } from "@/hooks/use-mounted";
import { getActiveBreadcrumbExtraItems } from "@/lib/breadcrumb-trailing-items";
import { getOrganizationSectionHref } from "@/lib/organization-sections";
import {
  getProjectBreadcrumbHref,
  isProjectSectionDetailPath,
} from "@/lib/project-sections";
import { getTasksDueListHref } from "@/lib/tasks-due-filters";
import { isTaskOpenedFromTasks } from "@/lib/task-navigation-context";

type ProjectLayoutBreadcrumbProps = {
  projectRouteParam: string;
  /** Real project title only — omit while loading so the chrome skeleton stays up. */
  projectName?: string | null;
  organizationContext?: {
    organizationRouteParam: string;
    organizationName: string;
  };
};

function ProjectLayoutBreadcrumbInner({
  projectRouteParam,
  projectName,
  organizationContext,
}: {
  projectRouteParam: string;
  projectName: string;
  organizationContext?: ProjectLayoutBreadcrumbProps["organizationContext"];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mounted = useMounted();
  const extraItems = useProjectBreadcrumbItems();
  const activeExtraItems = mounted
    ? getActiveBreadcrumbExtraItems(
        pathname,
        extraItems,
        (currentPathname) =>
          isProjectSectionDetailPath(currentPathname, projectRouteParam),
      )
    : [];
  const fromTasks = isTaskOpenedFromTasks(searchParams, pathname);
  const onDetailPage = isProjectSectionDetailPath(pathname, projectRouteParam);
  const hasTrailingItems = activeExtraItems.length > 0;
  const projectBreadcrumbHref = getProjectBreadcrumbHref(
    pathname,
    projectRouteParam,
    hasTrailingItems || onDetailPage,
  );

  const anchors = organizationContext
    ? [
        { label: "Organizations", href: "/organizations" },
        {
          label: organizationContext.organizationName,
          href: getOrganizationSectionHref(
            organizationContext.organizationRouteParam,
            "projects",
          ),
        },
        {
          label: projectName,
          href: projectBreadcrumbHref,
        },
      ]
    : fromTasks
      ? [{ label: "Tasks", href: getTasksDueListHref() }]
      : [
          { label: "Projects", href: "/projects" },
          {
            label: projectName,
            href: projectBreadcrumbHref,
          },
        ];

  return (
    <RegisterBreadcrumbChrome
      anchors={anchors}
      includeTrailingItems={(currentPathname) =>
        isProjectSectionDetailPath(currentPathname, projectRouteParam)
      }
    />
  );
}

/** Circle ProjectLayoutBreadcrumb — registers anchors for the shell host. */
export function ProjectLayoutBreadcrumb({
  projectRouteParam,
  projectName,
  organizationContext,
}: ProjectLayoutBreadcrumbProps) {
  const title = projectName?.trim() || null;
  if (!title) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <ProjectLayoutBreadcrumbInner
        projectRouteParam={projectRouteParam}
        projectName={title}
        organizationContext={organizationContext}
      />
    </Suspense>
  );
}
