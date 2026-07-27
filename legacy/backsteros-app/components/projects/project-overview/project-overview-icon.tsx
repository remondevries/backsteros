"use client";

import { useState, useTransition } from "react";

import { updateProjectIconAction } from "@/lib/mutations/projects";
import { ProjectOcticon } from "@/components/project-icon";
import { useRegisterTabIcon } from "@/components/shell/use-register-tab-icon";
import { updateLocalProjectIcon } from "@/lib/sync/local-project-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { entityIconsEqual } from "@/lib/entity-icon";

import { ProjectIconPicker } from "./project-icon-picker";

type ProjectOverviewIconProps = {
  projectId: string;
  icon: string | null;
  name: string;
  /** Boxed editor control on desktop overview; plain icon on compact headers. */
  variant?: "boxed" | "inline";
};

export function ProjectOverviewIcon({
  projectId,
  icon: initialIcon,
  name,
  variant = "boxed",
}: ProjectOverviewIconProps) {
  const [icon, setIcon] = useState<string | null>(initialIcon);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [prevInitialIcon, setPrevInitialIcon] = useState(initialIcon);
  if (initialIcon !== prevInitialIcon) {
    setPrevInitialIcon(initialIcon);
    setIcon(initialIcon);
  }

  useRegisterTabIcon(icon);

  function handleSelect(nextIcon: string | null) {
    if (entityIconsEqual(nextIcon, icon)) {
      return;
    }

    const previousIcon = icon;
    setIcon(nextIcon);
    setError(null);

    startTransition(async () => {
      const result = await runEntityPersist(
        () => updateLocalProjectIcon({ projectId, icon: nextIcon }),
        () => updateProjectIconAction({ projectId, icon: nextIcon }),
      );

      if (!result.ok) {
        setIcon(previousIcon);
        setError(result.error);
      }
    });
  }

  const isInline = variant === "inline";

  return (
    <div
      className={`flex flex-col gap-1${isInline ? " project-overview-icon--inline" : ""}`}
    >
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={isPending}
        aria-label={`Change project icon for ${name}`}
        className={
          isInline
            ? "inline-flex shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-foreground transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/20 disabled:cursor-wait disabled:opacity-60"
            : "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-[0.5px] border-white/10 bg-white/5 text-foreground transition-opacity hover:bg-white/8 hover:opacity-90 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/20 disabled:cursor-wait disabled:opacity-60"
        }
      >
        <ProjectOcticon
          icon={icon}
          size={isInline ? 18 : 16}
          className={
            isInline ? "shrink-0 text-foreground/70" : "text-foreground/85"
          }
        />
      </button>

      <ProjectIconPicker
        open={pickerOpen}
        value={icon}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
      />

      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
