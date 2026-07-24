"use client";

import type { ReactNode } from "react";

export type ProjectTypeGroupSectionProps = {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/**
 * Nested type subgroup inside a status group (e.g. Codebase under Active).
 * Default/general projects render without this wrapper.
 */
export function ProjectTypeGroupSection({
  title,
  collapsed,
  onToggle,
  children,
}: ProjectTypeGroupSectionProps) {
  return (
    <li className="project-type-subgroup" data-type-group={title}>
      <button
        type="button"
        className="project-type-subgroup__header"
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <span className="project-type-subgroup__toggle" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M9 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="project-type-subgroup__label">{title}</span>
        <span className="project-type-subgroup__rule" aria-hidden="true" />
      </button>
      {!collapsed ? (
        <ul className="project-type-subgroup__items">{children}</ul>
      ) : null}
    </li>
  );
}
