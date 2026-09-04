"use client";

import { resolveCrmGroupColor } from "../../crm/crm-group-color.js";

export type CrmGroupColorDotProps = {
  color?: string | null;
  size?: number;
  className?: string;
};

/** Small round color mark for CRM group labels. */
export function CrmGroupColorDot({
  color,
  size = 8,
  className = "",
}: CrmGroupColorDotProps) {
  return (
    <span
      className={["crm-group-color-dot", className].filter(Boolean).join(" ")}
      style={{
        width: size,
        height: size,
        backgroundColor: resolveCrmGroupColor(color),
      }}
      aria-hidden="true"
    />
  );
}

export type CrmGroupLabelProps = {
  name: string;
  color?: string | null;
  className?: string;
  /** Denser chip for list rows (task-row style). */
  compact?: boolean;
};

/** Pill label with color dot + name (chip / tag style). */
export function CrmGroupLabel({
  name,
  color,
  className = "",
  compact = false,
}: CrmGroupLabelProps) {
  return (
    <span
      className={[
        "crm-group-label",
        compact ? "crm-group-label--compact" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <CrmGroupColorDot color={color} size={compact ? 6 : 8} />
      <span className="crm-group-label__name">{name}</span>
    </span>
  );
}
