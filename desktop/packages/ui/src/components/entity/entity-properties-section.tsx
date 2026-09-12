"use client";

import { useId, useState, type ReactNode } from "react";

import { ChevronDownIcon } from "../icons/chevron-down-icon.js";

export type EntityPropertiesSectionProps = {
  title: string;
  children: ReactNode;
  /** Start collapsed (title only). Default false. */
  defaultCollapsed?: boolean;
};

/** Collapsible section chrome for property rails. */
export function EntityPropertiesSection({
  title,
  children,
  defaultCollapsed = false,
}: EntityPropertiesSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const bodyId = useId();

  return (
    <section
      className={[
        "entity-properties-section",
        collapsed ? "is-collapsed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="entity-properties-section__header">
        <h3 className="entity-properties-section__title">{title}</h3>
        <button
          type="button"
          className="entity-properties-section__chevron"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronDownIcon size={12} />
        </button>
      </header>
      {collapsed ? null : (
        <div id={bodyId} className="entity-properties-section__body">
          {children}
        </div>
      )}
    </section>
  );
}

/** @deprecated Prefer EntityPropertiesSection */
export const TaskDetailPropertiesSection = EntityPropertiesSection;
