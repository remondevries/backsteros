"use client";

import type { EstimatePlanComparisonData } from "../../finance/estimate-table-display.js";

export type EstimatePlanComparisonProps = {
  data: EstimatePlanComparisonData;
  className?: string;
};

/**
 * Estimate-only plan matrix (UIARC plan-comparison shaped) driven by a normal
 * markdown table marked with `<!-- estimate-table: plan-comparison -->`.
 */
export function EstimatePlanComparison({
  data,
  className,
}: EstimatePlanComparisonProps) {
  const rootClass = ["estimate-plan-comparison", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} data-estimate-table="plan-comparison">
      <div className="estimate-plan-comparison__matrix" role="table">
        <div className="estimate-plan-comparison__plan-header" role="row">
          <div
            className="estimate-plan-comparison__feature-header"
            role="columnheader"
          >
            {data.featureHeader.trim() || "Options"}
          </div>
          <div className="estimate-plan-comparison__plan-cell" role="columnheader">
            <h3 className="estimate-plan-comparison__plan-name">
              {data.leftLabel}
            </h3>
          </div>
          <div className="estimate-plan-comparison__plan-cell" role="columnheader">
            <h3 className="estimate-plan-comparison__plan-name">
              {data.rightLabel}
            </h3>
          </div>
        </div>
        <div className="estimate-plan-comparison__rows">
          {data.rows.map((row) => (
            <div
              key={row.label}
              className="estimate-plan-comparison__feature-row"
              role="row"
            >
              <div
                className="estimate-plan-comparison__feature-name"
                role="rowheader"
              >
                {row.label}
              </div>
              <div
                className="estimate-plan-comparison__feature-value"
                role="cell"
              >
                <span className="estimate-plan-comparison__mobile-plan">
                  {data.leftLabel}
                </span>
                {row.left}
              </div>
              <div
                className="estimate-plan-comparison__feature-value"
                role="cell"
              >
                <span className="estimate-plan-comparison__mobile-plan">
                  {data.rightLabel}
                </span>
                {row.right}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
