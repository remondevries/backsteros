"use client";

import type { ReactNode } from "react";

export type EntityOverviewFieldProps = {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  /**
   * `inline` — label left of control (contact/org details).
   * `stacked` — label above control (narrow project panel).
   */
  layout?: "inline" | "stacked";
};

/**
 * Labeled property row. Default is side-by-side; use `layout="stacked"` when
 * the panel is narrow and each control should sit under its name.
 */
export function EntityOverviewField({
  label,
  htmlFor,
  children,
  layout = "inline",
}: EntityOverviewFieldProps) {
  const labelNode = htmlFor ? (
    <label className="entity-overview-field__label" htmlFor={htmlFor}>
      {label}
    </label>
  ) : (
    <span className="entity-overview-field__label">{label}</span>
  );

  return (
    <div
      className={[
        "entity-overview-field",
        layout === "stacked" ? "entity-overview-field--stacked" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {labelNode}
      {children}
    </div>
  );
}
