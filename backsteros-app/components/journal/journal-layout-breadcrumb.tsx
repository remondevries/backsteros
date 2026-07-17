"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { RegisterBreadcrumbChrome } from "@/components/navigation/breadcrumb-chrome";
import { useProjectBreadcrumbItems } from "@/components/projects/project-breadcrumb-context";
import { useMounted } from "@/hooks/use-mounted";
import { getActiveBreadcrumbExtraItems } from "@/lib/breadcrumb-trailing-items";
import { formatJournalEntryTitle } from "@/lib/journal/dates";
import {
  getJournalHref,
  getSelectedJournalDateFromPathname,
  isJournalDetailPath,
} from "@/lib/journal/navigation-path";

function JournalLayoutBreadcrumbInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mounted = useMounted();
  const extraItems = useProjectBreadcrumbItems();
  const activeExtraItems = mounted
    ? getActiveBreadcrumbExtraItems(
        pathname,
        extraItems,
        isJournalDetailPath,
      )
    : [];
  const hasTrailingItems = activeExtraItems.length > 0;
  const onJournalDetail = isJournalDetailPath(pathname);
  const journalDate = getSelectedJournalDateFromPathname(pathname);
  const journalDateTitle = journalDate
    ? formatJournalEntryTitle(journalDate)
    : null;
  const hasTaskState = searchParams.has("task");
  const leafMatchesDate =
    activeExtraItems.length === 1 &&
    activeExtraItems[0]?.label === journalDateTitle;

  // When ?task= is open, put the date in anchors and suppress a duplicate date leaf.
  const includeTrailingItems = hasTaskState && leafMatchesDate
    ? () => false
    : isJournalDetailPath;

  const anchors = [
    {
      label: "Journal",
      href: onJournalDetail || hasTrailingItems ? "/journal" : undefined,
    },
    ...(hasTaskState && journalDate && journalDateTitle
      ? [
          {
            label: journalDateTitle,
            href: getJournalHref(journalDate),
          },
        ]
      : []),
  ];

  return (
    <RegisterBreadcrumbChrome
      anchors={anchors}
      includeTrailingItems={includeTrailingItems}
    />
  );
}

/** Circle JournalLayoutBreadcrumb. */
export function JournalLayoutBreadcrumb() {
  return (
    <Suspense
      fallback={
        <RegisterBreadcrumbChrome anchors={[{ label: "Journal" }]} />
      }
    >
      <JournalLayoutBreadcrumbInner />
    </Suspense>
  );
}
