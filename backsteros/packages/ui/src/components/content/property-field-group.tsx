"use client";

import type { ReactNode } from "react";

export type PropertyFieldGroupProps = {
  label: string;
  children: ReactNode;
};

/** Label above a property control — matches Next.js properties panel chrome. */
export function PropertyFieldGroup({
  label,
  children,
}: PropertyFieldGroupProps) {
  return (
    <div className="property-field-group">
      <span className="property-field-group__label">{label}</span>
      {children}
    </div>
  );
}
