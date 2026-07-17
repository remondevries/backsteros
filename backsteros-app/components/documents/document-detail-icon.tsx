"use client";

import { useState, useTransition } from "react";

import { EntityIconPicker } from "@/components/icons/entity-icon-picker";
import { useRegisterTabIcon } from "@/components/shell/use-register-tab-icon";
import { entityIconsEqual } from "@/lib/entity-icon";
import { updateDocumentIconAction } from "@/lib/mutations/documents";

import { DocumentIcon } from "./document-icon";
import { DocumentOcticon } from "./document-octicon";

type DocumentDetailIconProps = {
  documentId: string;
  icon: string | null;
  title: string;
};

export function DocumentDetailIcon({
  documentId,
  icon: initialIcon,
  title,
}: DocumentDetailIconProps) {
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
      const result = await updateDocumentIconAction({
        documentId,
        icon: nextIcon,
      });

      if (!result.ok) {
        setIcon(previousIcon);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={isPending}
        aria-label={`Change document icon for ${title}`}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-[0.5px] border-white/10 bg-white/5 text-foreground transition-opacity hover:bg-white/8 hover:opacity-90 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/20 disabled:cursor-wait disabled:opacity-60"
      >
        <DocumentOcticon
          icon={icon}
          size={16}
          className="text-foreground/85"
        />
      </button>

      <EntityIconPicker
        open={pickerOpen}
        value={icon}
        dialogTitle="Choose document icon"
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
        defaultOption={{
          label: "Default document icon",
          preview: <DocumentIcon className="size-4 text-current" />,
        }}
      />

      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
