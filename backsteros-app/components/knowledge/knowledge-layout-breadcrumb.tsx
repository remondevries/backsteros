"use client";

import { usePathname } from "next/navigation";

import { RegisterBreadcrumbChrome } from "@/components/navigation/breadcrumb-chrome";
import { useProjectBreadcrumbItems } from "@/components/projects/project-breadcrumb-context";
import { useMounted } from "@/hooks/use-mounted";
import { getActiveBreadcrumbExtraItems } from "@/lib/breadcrumb-trailing-items";
import { isKnowledgeDocumentDetailPath } from "@/lib/knowledge/navigation-path";

/** Circle KnowledgeLayoutBreadcrumb. */
export function KnowledgeLayoutBreadcrumb() {
  const pathname = usePathname();
  const mounted = useMounted();
  const extraItems = useProjectBreadcrumbItems();
  const activeExtraItems = mounted
    ? getActiveBreadcrumbExtraItems(
        pathname,
        extraItems,
        isKnowledgeDocumentDetailPath,
      )
    : [];
  const hasTrailingItems = activeExtraItems.length > 0;
  const onKnowledgeDetail = isKnowledgeDocumentDetailPath(pathname);

  return (
    <RegisterBreadcrumbChrome
      anchors={[
        {
          label: "Knowledge Base",
          href:
            onKnowledgeDetail || hasTrailingItems ? "/knowledge" : undefined,
        },
      ]}
      includeTrailingItems={isKnowledgeDocumentDetailPath}
    />
  );
}
