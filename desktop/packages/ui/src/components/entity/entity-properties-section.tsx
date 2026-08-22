"use client";

import type { ReactNode } from "react";

export type EntityPropertiesSectionProps = {
  title: string;
  children: ReactNode;
};

/** Collapsible-looking section chrome for property rails. */
export function EntityPropertiesSection({
  title,
  children,
}: EntityPropertiesSectionProps) {
  return (
    <section className="entity-properties-section">
      <header className="entity-properties-section__header">
        <h3 className="entity-properties-section__title">{title}</h3>
        <span aria-hidden="true" className="entity-properties-section__chevron">
          ▾
        </span>
      </header>
      <div className="entity-properties-section__body">{children}</div>
    </section>
  );
}

/** @deprecated Prefer EntityPropertiesSection */
export const TaskDetailPropertiesSection = EntityPropertiesSection;
