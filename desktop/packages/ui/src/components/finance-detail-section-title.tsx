"use client";

import type { ReactNode } from "react";

export type FinanceDetailSectionTitleProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Section title with an inline hairline rule (same idea as month subgroup
 * headers), without a collapse control.
 */
export function FinanceDetailSectionTitle({
  children,
  className,
}: FinanceDetailSectionTitleProps) {
  return (
    <div
      className={["finance-detail-section-title", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="finance-detail-section-title__label">{children}</span>
      <span className="finance-detail-section-title__rule" aria-hidden="true" />
    </div>
  );
}
