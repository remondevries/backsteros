"use client";

import { useState, useTransition } from "react";

import { entityIconsEqual } from "../entity-icon.js";
import { DocumentIcon } from "./document-icon.js";
import { DocumentOcticon } from "./document-octicon.js";
import { EntityIconPicker } from "./entity-icon-picker.js";

export type DocumentDetailIconProps = {
  documentId: string;
  icon: string | null;
  title: string;
  onSaveIcon: (
    icon: string | null,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
};

/**
 * Bordered 32×32 icon chip above document/journal titles (Next parity).
 * Title itself stays borderless via OverviewNameEditor.
 */
export function DocumentDetailIcon({
  documentId,
  icon: initialIcon,
  title,
  onSaveIcon,
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

  void documentId;

  function handleSelect(nextIcon: string | null) {
    if (entityIconsEqual(nextIcon, icon)) {
      return;
    }

    const previousIcon = icon;
    setIcon(nextIcon);
    setError(null);

    startTransition(async () => {
      const result = await onSaveIcon(nextIcon);

      if (!result.ok) {
        setIcon(previousIcon);
        setError(result.error);
      }
    });
  }

  return (
    <div className="document-detail-icon">
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={isPending}
        aria-label={`Change document icon for ${title}`}
        className="document-detail-icon__button"
      >
        <DocumentOcticon
          icon={icon}
          size={16}
          className="document-detail-icon__glyph"
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
          preview: <DocumentIcon size={16} />,
        }}
      />

      {error ? (
        <p className="document-detail-icon__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
