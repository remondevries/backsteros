"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@primer/octicons-react";
import type { MoneybirdInvoiceActivityItem } from "@backsteros/contracts";

import { EmailMessageHtmlBody } from "../email/email-message-html-body.js";
import { EmailPlainBody } from "../email/email-plain-body.js";
import { MoneybirdIcon } from "../icons/moneybird-icon.js";
import { ProfileLogoIcon } from "../icons/profile-logo-icon.js";

export type FinanceInvoiceActivityEmailPreview = {
  subject: string;
  html: string | null;
  text: string | null;
  from?: string | null;
  to?: string[] | null;
};

export type FinanceInvoiceActivityTimelineProps = {
  items: MoneybirdInvoiceActivityItem[];
  loading?: boolean;
  error?: string | null;
  /** Load the AgentMail message for a portal email activity (1:1 by stored ids). */
  onLoadPortalEmail?: (input: {
    inboxId: string;
    messageId: string;
  }) => Promise<FinanceInvoiceActivityEmailPreview>;
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
      // Brand mark next to the title already signals BacksterOS — no badge.
      return null;
    case "moneybird_email":
    case "moneybird_post":
    case "moneybird_manual":
    case "moneybird_peppol":
      // Moneybird icon next to the title already signals the source — no badge.
      return null;
    case "system":
      return "System";
    default:
      return null;
  }
}

function canOpenPortalEmail(
  item: MoneybirdInvoiceActivityItem,
  hasLoader: boolean,
): boolean {
  if (!hasLoader) return false;
  if (item.channel !== "portal_email") return false;
  return Boolean(item.agentMailInboxId?.trim() && item.agentMailMessageId?.trim());
}

function isMoneybirdChannel(
  channel: MoneybirdInvoiceActivityItem["channel"],
): boolean {
  return (
    channel === "moneybird_email" ||
    channel === "moneybird_post" ||
    channel === "moneybird_manual" ||
    channel === "moneybird_peppol"
  );
}

export function FinanceInvoiceActivityTimeline({
  items,
  loading = false,
  error = null,
  onLoadPortalEmail,
}: FinanceInvoiceActivityTimelineProps) {
  const [selected, setSelected] = useState<MoneybirdInvoiceActivityItem | null>(
    null,
  );
  const [preview, setPreview] = useState<FinanceInvoiceActivityEmailPreview | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected || !onLoadPortalEmail) return;
    const inboxId = selected.agentMailInboxId?.trim() ?? "";
    const messageId = selected.agentMailMessageId?.trim() ?? "";
    if (!inboxId || !messageId) return;

    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    void onLoadPortalEmail({ inboxId, messageId })
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
      })
      .catch((caught) => {
        if (cancelled) return;
        setPreviewError(
          caught instanceof Error ? caught.message : "Failed to load email",
        );
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onLoadPortalEmail, selected]);

  useEffect(() => {
    if (!selected) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [selected]);

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

  const hasLoader = Boolean(onLoadPortalEmail);

  return (
    <div className="finance-invoice-activity">
      <ol className="finance-invoice-activity__list">
        {items.map((item, index) => {
          const channel = channelLabel(item.channel);
          const openable = canOpenPortalEmail(item, hasLoader);
          const latest = index === 0;
          const body = (
            <>
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
              <p className="finance-invoice-activity__label">
                {item.channel === "portal_email" ? (
                  <ProfileLogoIcon
                    className="finance-invoice-activity__brand"
                    size={16}
                  />
                ) : isMoneybirdChannel(item.channel) ? (
                  <MoneybirdIcon
                    className="finance-invoice-activity__brand finance-invoice-activity__brand--moneybird"
                    size={16}
                    withTile={false}
                  />
                ) : null}
                <span>{item.label}</span>
              </p>
              {openable ? (
                <span className="finance-invoice-activity__hint">
                  View sent email
                </span>
              ) : null}
            </>
          );

          return (
            <li key={item.id} className="finance-invoice-activity__item">
              <div
                className={
                  latest
                    ? "finance-invoice-activity__dot finance-invoice-activity__dot--latest"
                    : "finance-invoice-activity__dot"
                }
                aria-hidden="true"
              />
              {openable ? (
                <button
                  type="button"
                  className="finance-invoice-activity__body finance-invoice-activity__body--button"
                  onClick={() => setSelected(item)}
                >
                  {body}
                </button>
              ) : (
                <div className="finance-invoice-activity__body">{body}</div>
              )}
            </li>
          );
        })}
      </ol>

      {selected && typeof document !== "undefined"
        ? createPortal(
            <div
              className="finance-invoice-activity-email-modal-root"
              data-blocking-modal=""
            >
              <button
                type="button"
                className="finance-invoice-activity-email-modal__backdrop"
                aria-label="Close email preview"
                onClick={() => setSelected(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={preview?.subject?.trim() || selected.label}
                className="finance-invoice-activity-email-modal"
              >
                <button
                  type="button"
                  className="finance-invoice-activity-email-modal__close"
                  aria-label="Close"
                  onClick={() => setSelected(null)}
                >
                  <XIcon size={16} />
                </button>
                <div className="finance-invoice-activity-email-modal__body">
                  {previewLoading ? (
                    <p className="finance-invoice-activity__empty">
                      Loading email…
                    </p>
                  ) : null}
                  {previewError ? (
                    <p className="finance-invoice-activity__error" role="alert">
                      {previewError}
                    </p>
                  ) : null}
                  {!previewLoading && !previewError && preview ? (
                    preview.html?.trim() ? (
                      <EmailMessageHtmlBody html={preview.html} />
                    ) : preview.text?.trim() ? (
                      <EmailPlainBody text={preview.text} />
                    ) : (
                      <p className="finance-invoice-activity__empty">
                        This message has no body content.
                      </p>
                    )
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
