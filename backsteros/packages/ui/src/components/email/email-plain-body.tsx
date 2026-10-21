"use client";

import { useMemo, useState } from "react";

import { splitPlainTextEmailQuotes } from "../../email/email-quote-collapse.js";

export type EmailPlainBodyProps = {
  text: string;
  /** Fallback when `text` is empty. */
  emptyLabel?: string;
};

/**
 * Plain-text email body with quoted reply history collapsed behind a toggle
 * (same pattern as Gmail / Apple Mail “…” quoted text).
 */
export function EmailPlainBody({
  text,
  emptyLabel = "",
}: EmailPlainBodyProps) {
  const trimmed = text.trim();
  const { visible, quoted } = useMemo(
    () => splitPlainTextEmailQuotes(text),
    [text],
  );
  const [expanded, setExpanded] = useState(false);

  if (!trimmed) {
    return <>{emptyLabel}</>;
  }

  if (!quoted) {
    return <>{text}</>;
  }

  return (
    <>
      {visible}
      {visible ? "\n\n" : null}
      <button
        type="button"
        className="email-quote-toggle"
        aria-expanded={expanded}
        aria-label={expanded ? "Hide quoted text" : "Show quoted text"}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "Hide quoted text" : "···"}
      </button>
      {expanded ? (
        <div className="email-quote-block" data-email-quote>
          {quoted}
        </div>
      ) : null}
    </>
  );
}
