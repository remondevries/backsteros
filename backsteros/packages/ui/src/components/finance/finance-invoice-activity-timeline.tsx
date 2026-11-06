"use client";

import type { MoneybirdInvoiceActivityItem } from "@backsteros/contracts";

export type FinanceInvoiceActivityTimelineProps = {
  items: MoneybirdInvoiceActivityItem[];
  loading?: boolean;
  error?: string | null;
};

function formatActivityAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function channelLabel(
  channel: MoneybirdInvoiceActivityItem["channel"],
): string | null {
  switch (channel) {
    case "portal_email":
      return "Portal email";
    case "moneybird_email":
      return "Moneybird email";
    case "moneybird_post":
      return "Moneybird post";
    case "moneybird_manual":
      return "Moneybird manual";
    case "moneybird_peppol":
      return "Peppol";
    case "system":
      return "System";
    default:
      return null;
  }
}

export function FinanceInvoiceActivityTimeline({
  items,
  loading = false,
  error = null,
}: FinanceInvoiceActivityTimelineProps) {
  if (loading) {
    return (
      <div className="finance-invoice-activity" aria-busy="true">
        <p className="finance-invoice-activity__empty">Loading activity…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="finance-invoice-activity">
        <p className="finance-invoice-activity__error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="finance-invoice-activity">
        <p className="finance-invoice-activity__empty">
          No send or reminder activity yet.
        </p>
      </div>
    );
  }

  return (
    <div className="finance-invoice-activity">
      <ol className="finance-invoice-activity__list">
        {items.map((item) => {
          const channel = channelLabel(item.channel);
          return (
            <li key={item.id} className="finance-invoice-activity__item">
              <div className="finance-invoice-activity__dot" aria-hidden="true" />
              <div className="finance-invoice-activity__body">
                <div className="finance-invoice-activity__meta">
                  <time dateTime={item.at}>{formatActivityAt(item.at)}</time>
                  {channel ? (
                    <span className="finance-invoice-activity__channel">
                      {channel}
                    </span>
                  ) : null}
                  {item.step != null ? (
                    <span className="finance-invoice-activity__step">
                      R{item.step}
                    </span>
                  ) : null}
                </div>
                <p className="finance-invoice-activity__label">{item.label}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
