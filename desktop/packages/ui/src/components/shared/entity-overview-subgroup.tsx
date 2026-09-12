"use client";

import type { ReactNode } from "react";

export type EntityOverviewSubgroupProps = {
  title: string;
  children?: ReactNode;
};

/**
 * Labeled rule separator + field group — same visual language as contact/org
 * Details subgroups ("Personal Details", "Contact Details", …).
 */
export function EntityOverviewSubgroup({
  title,
  children,
}: EntityOverviewSubgroupProps) {
  return (
    <div className="entity-overview-subgroup" data-subgroup={title}>
      <div className="entity-overview-subgroup__header">
        <span className="entity-overview-subgroup__label">{title}</span>
        <span className="entity-overview-subgroup__rule" aria-hidden="true" />
      </div>
      {children != null ? (
        <div className="entity-overview-subgroup__fields">{children}</div>
      ) : null}
    </div>
  );
}
