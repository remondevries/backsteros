"use client";

import { useState } from "react";

import { ProjectIconPicker } from "./project-icon-picker.js";
import { ProjectOcticon } from "./project-octicon.js";

export type ProjectOverviewIconProps = {
  icon: string | null | undefined;
  name: string;
  disabled?: boolean;
  onIconChange?: (icon: string | null) => void | Promise<void>;
};

/**
 * Clickable project icon that opens the icon picker when `onIconChange` is set.
 */
export function ProjectOverviewIcon({
  icon: initialIcon,
  name,
  disabled = false,
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
    <div className="project-overview-icon">
      <button
        type="button"
        className="project-overview-icon__trigger"
        disabled={!interactive || pending}
        aria-label={`Change project icon for ${name}`}
        onClick={() => {
          if (interactive) setPickerOpen(true);
        }}
      >
        <ProjectOcticon icon={icon} size={28} />
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
