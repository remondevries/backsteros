"use client";

import { EntityDetailLayout } from "../entity/entity-detail-layout.js";

export type FinanceSectionPlaceholderProps = {
  title: string;
  description?: string;
};

export function FinanceSectionPlaceholder({
  title,
  description = "This section is coming soon.",
}: FinanceSectionPlaceholderProps) {
  return (
    <EntityDetailLayout sectionLabel="Finance" title={title}>
      <div className="finance-section-placeholder">
        <p className="finance-empty">{description}</p>
      </div>
    </EntityDetailLayout>
  );
}
