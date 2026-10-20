"use client";

export type ContactDetailChipsMoreProps = {
  expanded: boolean;
  /** Count of items still hidden when collapsed. */
  hiddenCount: number;
  disabled?: boolean;
  onToggle: () => void;
};

/**
 * Full-width “View more / View less” control with a centered label and
 * hairline rules on both sides (distinct from subgroup headers).
 */
export function ContactDetailChipsMore({
  expanded,
  hiddenCount,
  disabled = false,
  onToggle,
}: ContactDetailChipsMoreProps) {
  const label = expanded ? "View less" : `View more (${hiddenCount})`;
  return (
    <button
      type="button"
      className="entity-overview-subgroup__header contact-detail-chips__more"
      disabled={disabled}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span className="entity-overview-subgroup__rule" aria-hidden="true" />
      <span className="entity-overview-subgroup__label">{label}</span>
      <span className="entity-overview-subgroup__rule" aria-hidden="true" />
    </button>
  );
}
