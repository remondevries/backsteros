import { SegmentedPillToggle } from "@backsteros/ui";
import {
  PRESENTATION_KINDS,
  PRESENTATION_LABELS,
  type PresentationKind,
} from "../presentation";

type PresentationModeTabsProps = {
  selected: PresentationKind | null;
  broadcastKind: PresentationKind | null;
  focusedIndex: number;
  onSelect: (kind: PresentationKind) => void;
};

const PRESENTATION_OPTIONS = PRESENTATION_KINDS.map((kind) => ({
  value: kind,
  label: PRESENTATION_LABELS[kind],
}));

/**
 * Local / Screenshare control — same SegmentedPillToggle used across the
 * desktop shell (Preview/Edit, list/board, etc.).
 */
export function PresentationModeTabs({
  selected,
  broadcastKind,
  focusedIndex,
  onSelect,
}: PresentationModeTabsProps) {
  // SegmentedPillToggle highlights by value match. When nothing is prepared,
  // pass a non-option sentinel so neither segment reads as selected.
  const value = (selected ?? "__none__") as PresentationKind;

  return (
    <div
      className="director__presentation-toggle"
      data-tauri-drag-region="false"
      data-broadcast={broadcastKind ?? undefined}
      data-picker-focus={selected == null ? String(focusedIndex) : undefined}
    >
      <SegmentedPillToggle
        value={value}
        options={PRESENTATION_OPTIONS}
        onChange={onSelect}
        ariaLabel="Presentation mode"
      />
    </div>
  );
}
