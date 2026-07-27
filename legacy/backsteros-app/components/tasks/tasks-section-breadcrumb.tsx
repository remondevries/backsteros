"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";

import { RegisterBreadcrumbChrome } from "@/components/navigation/breadcrumb-chrome";
import {
  isTasksDueTaskDetailPath,
  isTasksSectionTaskDetailPath,
} from "@/lib/breadcrumb-items";
import {
  getTasksDueListHref,
  parseTasksDueFilterFromPathname,
} from "@/lib/tasks-due-filters";

function TasksSectionBreadcrumbInner() {
  const pathname = usePathname();
  const dueFilter = parseTasksDueFilterFromPathname(pathname);

  return (
    <RegisterBreadcrumbChrome
      anchors={[
        {
          label: "Tasks",
          href: getTasksDueListHref(dueFilter ?? undefined),
        },
      ]}
      includeTrailingItems={(currentPathname) =>
        isTasksDueTaskDetailPath(currentPathname) ||
        isTasksSectionTaskDetailPath(currentPathname)
      }
    />
  );
}

/** Breadcrumb anchors for task detail opened from the Tasks section. */
export function TasksSectionBreadcrumb() {
  return (
    <Suspense
      fallback={<RegisterBreadcrumbChrome anchors={[{ label: "Tasks" }]} />}
    >
      <TasksSectionBreadcrumbInner />
    </Suspense>
  );
}
