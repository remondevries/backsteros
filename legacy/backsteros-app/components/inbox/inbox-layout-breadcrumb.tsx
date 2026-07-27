"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { RegisterBreadcrumbChrome } from "@/components/navigation/breadcrumb-chrome";
import { useProjectBreadcrumbItems } from "@/components/projects/project-breadcrumb-context";
import { useMounted } from "@/hooks/use-mounted";
import { getActiveBreadcrumbExtraItems } from "@/lib/breadcrumb-trailing-items";
import { isInboxTaskDetailPath } from "@/lib/inbox/navigation-path";
import { isTaskOpenedFromTasks } from "@/lib/task-navigation-context";

function InboxLayoutBreadcrumbInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mounted = useMounted();
  const extraItems = useProjectBreadcrumbItems();
  const activeExtraItems = mounted
    ? getActiveBreadcrumbExtraItems(
        pathname,
        extraItems,
        isInboxTaskDetailPath,
      )
    : [];
  const fromTasks = isTaskOpenedFromTasks(searchParams, pathname);
  const onTaskDetail = isInboxTaskDetailPath(pathname);
  const hasTrailingItems = activeExtraItems.length > 0;

  if (fromTasks) {
    return (
      <RegisterBreadcrumbChrome
        anchors={[{ label: "Tasks", href: "/tasks" }]}
        includeTrailingItems={isInboxTaskDetailPath}
      />
    );
  }

  return (
    <RegisterBreadcrumbChrome
      anchors={[
        {
          label: "Inbox",
          href: onTaskDetail || hasTrailingItems ? "/inbox" : undefined,
        },
      ]}
      includeTrailingItems={isInboxTaskDetailPath}
    />
  );
}

/** Circle InboxLayoutBreadcrumb. */
export function InboxLayoutBreadcrumb() {
  return (
    <Suspense
      fallback={<RegisterBreadcrumbChrome anchors={[{ label: "Inbox" }]} />}
    >
      <InboxLayoutBreadcrumbInner />
    </Suspense>
  );
}
