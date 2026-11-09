import { SegmentedPillToggle } from "@backsteros/ui";
import {
  PRESENTATION_KINDS,
  PRESENTATION_LABELS,
  type PresentationKind,
} from "../presentation";

type PresentationToggleValue = PresentationKind | "none";

type PresentationModeTabsProps = {
  selected: PresentationKind | null;
  broadcastKind: PresentationKind | null;
  focusedIndex: number;
  onSelect: (kind: PresentationKind | null) => void;
};

const PRESENTATION_OPTIONS: ReadonlyArray<{
  value: PresentationToggleValue;
  label: string;
}> = [
  { value: "none", label: "None" },
  ...PRESENTATION_KINDS.map((kind) => ({
    value: kind,
    label: PRESENTATION_LABELS[kind],
  })),
];

/**
 * None / Local / Screenshare — same SegmentedPillToggle used across the
 * desktop shell. None is the default and clears presentation prepare.
 */
export function PresentationModeTabs({
  selected,
  broadcastKind,
  focusedIndex,
  onSelect,
}: PresentationModeTabsProps) {
  const value: PresentationToggleValue = selected ?? "none";

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
        onChange={(next) => {
          onSelect(next === "none" ? null : next);
        }}
        ariaLabel="Presentation mode"
      />
    </div>
  );
}
