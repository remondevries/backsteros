"use client";

import { MobilePillNavFade } from "@/components/mobile/mobile-pill-nav-fade";
import {
  getTasksDueFilterLabel,
  TASKS_DUE_FILTERS,
  type TasksDueFilter,
} from "@/lib/tasks-due-filters";
import {
  APP_PILL_NAV_ITEM_CLASS,
  appPillNavItemStateClass,
} from "@/lib/ui/app-pill-nav";

type TasksDueNavProps = {
  activeFilter: TasksDueFilter;
  onFilterChange: (filter: TasksDueFilter) => void;
};

export function TasksDueNav({
  activeFilter,
  onFilterChange,
}: TasksDueNavProps) {
  return (
    <MobilePillNavFade
      aria-label="Task due date"
      className="app-pill-nav flex shrink-0 gap-2 px-2 pb-2"
    >
      {TASKS_DUE_FILTERS.map((filter) => {
        const isActive = filter === activeFilter;

        return (
          <button
            key={filter}
            type="button"
            onClick={() => onFilterChange(filter)}
            className={`${APP_PILL_NAV_ITEM_CLASS} ${appPillNavItemStateClass(isActive)}`}
            aria-current={isActive ? "page" : undefined}
          >
            {getTasksDueFilterLabel(filter)}
          </button>
        );
      })}
    </MobilePillNavFade>
  );
}
