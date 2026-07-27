"use client";

import { useState } from "react";

import { ProjectIconPicker } from "./project-icon-picker.js";
import { ProjectOcticon } from "./project-octicon.js";

export type ProjectOverviewIconProps = {
  icon: string | null | undefined;
  /** Used for the default glyph when no custom icon is set (e.g. codebase → terminal). */
  type?: string | null;
  name: string;
  disabled?: boolean;
  /** Glyph size in px. Default 28. */
  size?: number;
  /**
   * `bare` — no padded chrome around the glyph (panel headers).
   * Default keeps the bordered tile used on full project overview.
   */
  variant?: "default" | "bare";
  onIconChange?: (icon: string | null) => void | Promise<void>;
};

/**
 * Clickable project icon that opens the icon picker when `onIconChange` is set.
 */
export function ProjectOverviewIcon({
  icon: initialIcon,
  type,
  name,
  disabled = false,
  size = 28,
  variant = "default",
  onIconChange,
}: ProjectOverviewIconProps) {
  const [icon, setIcon] = useState<string | null>(initialIcon ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevIcon, setPrevIcon] = useState(initialIcon ?? null);

  if ((initialIcon ?? null) !== prevIcon) {
    setPrevIcon(initialIcon ?? null);
    setIcon(initialIcon ?? null);
  }

  const interactive = Boolean(onIconChange) && !disabled;

  return (
    <div
      className={`project-overview-icon${
        variant === "bare" ? " project-overview-icon--bare" : ""
      }`}
    >
      <button
        type="button"
        className="project-overview-icon__trigger"
        disabled={!interactive || pending}
        aria-label={`Change project icon for ${name}`}
        onClick={() => {
          if (interactive) setPickerOpen(true);
        }}
      >
        <ProjectOcticon icon={icon} type={type} size={size} />
      </button>
      {interactive ? (
        <ProjectIconPicker
          open={pickerOpen}
          value={icon}
          onClose={() => setPickerOpen(false)}
          onSelect={(next) => {
            const previous = icon;
            setIcon(next);
            setError(null);
            setPending(true);
            void Promise.resolve(onIconChange?.(next))
              .catch((reason: unknown) => {
                setIcon(previous);
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Could not update icon.",
                );
              })
              .finally(() => setPending(false));
          }}
        />
      ) : null}
      {error ? (
        <p className="project-overview-icon__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
