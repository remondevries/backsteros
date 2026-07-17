"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  getActiveProjectSection,
  getProjectSectionHref,
  PROJECT_SECTIONS,
} from "@/lib/project-sections";
import {
  APP_PILL_NAV_ITEM_CLASS,
  appPillNavItemStateClass,
} from "@/lib/ui/app-pill-nav";

type ProjectNavProps = {
  projectRouteParam: string;
};

export function ProjectNav({ projectRouteParam }: ProjectNavProps) {
  const pathname = usePathname();
  const activeId = getActiveProjectSection(pathname, projectRouteParam);

  return (
    <div className="app-pill-nav flex shrink-0 gap-2 p-2 pb-0" aria-label="Project sections">
      {PROJECT_SECTIONS.map((section) => {
        const isActive = section.id === activeId;
        const href = getProjectSectionHref(
          projectRouteParam,
          section.id,
          pathname,
        );

        return (
          <Link
            key={section.id}
            href={href}
            scroll={false}
            className={`${APP_PILL_NAV_ITEM_CLASS} ${appPillNavItemStateClass(isActive)}`}
            aria-current={isActive ? "page" : undefined}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}
