import type { ReactNode } from "react";

export type EmailThreadDetailsSpacerProps = {
  expanded: boolean;
  onToggle: () => void;
  /** Hidden activity count — used for a11y. */
  count: number;
  children?: ReactNode;
};

/**
 * Hairline spacer between emails. Collapsed shows "View details"; expanded
 * reveals agent notes / tasks / meetings that happened between messages.
 */
export function EmailThreadDetailsSpacer({
  expanded,
  onToggle,
  count,
  children,
}: EmailThreadDetailsSpacerProps) {
  const label = expanded ? "Hide details" : "View details";
  return (
    <div
      className={`email-thread-details${
        expanded ? " email-thread-details--expanded" : ""
      }`}
    >
      <div className="email-thread-details__rule" aria-hidden>
        <span className="email-thread-details__line" />
        <button
          type="button"
          className="email-thread-details__toggle"
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Hide ${count} detail${count === 1 ? "" : "s"}`
              : `View ${count} detail${count === 1 ? "" : "s"}`
          }
          onClick={onToggle}
        >
          {label}
        </button>
        <span className="email-thread-details__line" />
      </div>
      {expanded ? (
        <div className="email-thread-details__body">{children}</div>
      ) : null}
    </div>
  );
}
