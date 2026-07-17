"use client";

import { MobilePillNavFade } from "@/components/mobile/mobile-pill-nav-fade";
import {
  getProjectAreaFilterLabel,
  getProjectAreaLabel,
  PROJECT_AREA_FILTER_ALL,
  PROJECT_AREA_ORDER,
  type ProjectAreaFilter,
} from "@/lib/project-areas";
import {
  APP_PILL_NAV_ITEM_CLASS,
  appPillNavItemStateClass,
} from "@/lib/ui/app-pill-nav";

type ProjectsAreaNavProps = {
  activeArea: ProjectAreaFilter;
  onAreaChange: (area: ProjectAreaFilter) => void;
};

export function ProjectsAreaNav({
  activeArea,
  onAreaChange,
}: ProjectsAreaNavProps) {
  const filters: ProjectAreaFilter[] = [
    PROJECT_AREA_FILTER_ALL,
    ...PROJECT_AREA_ORDER,
  ];
  return (
    <MobilePillNavFade
      aria-label="Project areas"
      className="app-pill-nav flex shrink-0 gap-2 px-2 pb-2"
    >
      {filters.map((area) => {
        const isActive = area === activeArea;
        const label =
          area === PROJECT_AREA_FILTER_ALL
            ? getProjectAreaFilterLabel(area)
            : getProjectAreaLabel(area);

        return (
          <button
            key={area}
            type="button"
            onClick={() => onAreaChange(area)}
            className={`${APP_PILL_NAV_ITEM_CLASS} ${appPillNavItemStateClass(isActive)}`}
            aria-current={isActive ? "page" : undefined}
          >
            {label}
          </button>
        );
      })}
    </MobilePillNavFade>
  );
}
