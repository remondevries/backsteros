"use client";

import type { BreadcrumbItem } from "@/components/shell/breadcrumb";
import { RegisterProjectBreadcrumb } from "@/components/projects/project-breadcrumb-context";

/** Detail-page leaf crumb (Circle RegisterProjectBreadcrumb helper). */
export function DetailBreadcrumbLeaf({
  label,
  displayId,
}: {
  label: string;
  displayId?: string | null;
}) {
  const items: BreadcrumbItem[] = [
    {
      label: displayId ? `${displayId} ${label}` : label,
      node: (
        <span
          className="block truncate font-medium text-foreground/75"
          aria-current="page"
        >
          {displayId ? (
            <>
              <span className="font-mono tabular-nums text-foreground/50">
                {displayId}
              </span>{" "}
            </>
          ) : null}
          {label}
        </span>
      ),
    },
  ];

  return <RegisterProjectBreadcrumb items={items} />;
}
