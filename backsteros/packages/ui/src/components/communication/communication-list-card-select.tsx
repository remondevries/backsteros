"use client";

import type { MouseEvent } from "react";

import { PolishedCheckbox } from "../shared/polished-checkbox.js";

export type CommunicationListCardSelectProps = {
  itemId: string;
  checked: boolean;
  ariaLabel?: string;
  onToggleSelected?: (
    itemId: string,
    checked: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
};

/**
 * Top-left multi-select control for Messages list cards — fades in on hover /
 * while checked (see `.communication-chat__card-select` in chat.css).
 */
export function CommunicationListCardSelect({
  itemId,
  checked,
  ariaLabel = "Select conversation",
  onToggleSelected,
}: CommunicationListCardSelectProps) {
  if (!onToggleSelected) return null;
  return (
    <span className="communication-chat__card-select">
      <PolishedCheckbox
        checked={checked}
        ariaLabel={ariaLabel}
        onCheckedChange={(next, event) =>
          onToggleSelected(itemId, next, event)
        }
      />
    </span>
  );
}
