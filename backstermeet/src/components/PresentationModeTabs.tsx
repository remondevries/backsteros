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

/** Top-center Local / Screenshare controls. */
export function PresentationModeTabs({
  selected,
  broadcastKind,
  focusedIndex,
  onSelect,
}: PresentationModeTabsProps) {
  return (
    <nav
      className="director__mode-tabs"
      aria-label="Presentation mode"
      data-tauri-drag-region="false"
    >
      {PRESENTATION_KINDS.map((kind, index) => {
        const active = selected === kind;
        const focused = !selected && focusedIndex === index;
        const live = broadcastKind === kind;
        return (
          <button
            key={kind}
            type="button"
            className={[
              "director__mode-tab",
              active ? "is-active" : null,
              focused ? "is-focused" : null,
              live ? "is-broadcasting" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={active}
            onClick={() => onSelect(kind)}
          >
            {PRESENTATION_LABELS[kind]}
          </button>
        );
      })}
    </nav>
  );
}
