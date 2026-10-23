"use client";

import { useEffect, useMemo, useRef } from "react";

import {
  buildEmailShadowStyles,
  emailHtmlPrefersLightCanvas,
  normalizeEmailContentId,
  prepareEmailHtmlForDisplay,
  resolveEmailInlineAttachments,
  type EmailMessageInlineAttachment,
} from "../../email/email-message-html.js";
import { collectTrailingHtmlEmailQuoteNodes } from "../../email/email-quote-collapse.js";

export type EmailMessageHtmlBodyProps = {
  html: string;
  /** Shown when the HTML payload is empty after normalization. */
  fallback?: string | null;
  /** Inline attachments referenced by cid: URLs in the HTML body. */
  inlineAttachments?: EmailMessageInlineAttachment[] | null;
  /** Loads attachment bytes (e.g. via authenticated API). */
  loadInlineAttachment?: (attachmentId: string) => Promise<Blob>;
  /** Optional warm-cache lookup before hitting the network. */
  peekInlineAttachment?: (attachmentId: string) => Blob | null;
};

function isInlineContentResolved(
  root: ShadowRoot,
  contentId: string,
): boolean {
  const normalized = normalizeEmailContentId(contentId);
  if (!normalized) return false;
  return Boolean(
    root.querySelector(`img[data-inline-cid="${normalized}"]`),
  );
}

function applyInlineAttachmentUrls(
  root: ShadowRoot,
  contentId: string,
  objectUrl: string,
): void {
  const normalized = normalizeEmailContentId(contentId);
  if (!normalized) return;
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src")?.trim() ?? "";
    const match = /^cid:<?([^>]+)>?$/i.exec(src);
    if (match && normalizeEmailContentId(match[1]) === normalized) {
      img.src = objectUrl;
      img.setAttribute("data-inline-cid", normalized);
    }
  }
}

function applyCachedInlineAttachments(
  root: ShadowRoot,
  attachments: EmailMessageInlineAttachment[],
  peekInlineAttachment?: (attachmentId: string) => Blob | null,
): string[] {
  if (!peekInlineAttachment) return [];
  const objectUrls: string[] = [];
  for (const attachment of attachments) {
    const contentId = normalizeEmailContentId(attachment.contentId);
    if (!contentId || isInlineContentResolved(root, contentId)) continue;
    const blob = peekInlineAttachment(attachment.attachmentId);
    if (!blob) continue;
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.push(objectUrl);
    applyInlineAttachmentUrls(root, contentId, objectUrl);
  }
  return objectUrls;
}

/** Collapse trailing blockquotes / gmail_quote blocks behind a native disclosure. */
function collapseHtmlEmailQuotes(root: ShadowRoot): void {
  const nodes = collectTrailingHtmlEmailQuoteNodes(root);
  if (nodes.length === 0) return;
  const first = nodes[0]!;
  const parent = first.parentElement;
  if (!parent) return;

  const details = document.createElement("details");
  details.className = "email-quote-details";
  const summary = document.createElement("summary");
  summary.className = "email-quote-toggle";
  summary.textContent = "···";
  summary.setAttribute("aria-label", "Show quoted text");
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "email-quote-block";
  parent.insertBefore(details, first);
  for (const node of nodes) {
    body.appendChild(node);
  }
  details.appendChild(body);

  details.addEventListener("toggle", () => {
    summary.setAttribute(
      "aria-label",
      details.open ? "Hide quoted text" : "Show quoted text",
    );
    summary.textContent = details.open ? "Hide quoted text" : "···";
  });
}

/**
 * Rendered email body in a shadow root so message styles stay isolated.
 */
export function EmailMessageHtmlBody({
  html,
  fallback = null,
  inlineAttachments = null,
  loadInlineAttachment,
  peekInlineAttachment,
}: EmailMessageHtmlBodyProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const loadInlineAttachmentRef = useRef(loadInlineAttachment);
  const peekInlineAttachmentRef = useRef(peekInlineAttachment);
  loadInlineAttachmentRef.current = loadInlineAttachment;
  peekInlineAttachmentRef.current = peekInlineAttachment;

  const markup = useMemo(() => prepareEmailHtmlForDisplay(html), [html]);
  const canvas = useMemo(
    () => (emailHtmlPrefersLightCanvas(markup) ? "light" : "dark"),
    [markup],
  );
  const attachmentsToResolve = useMemo(
    () => resolveEmailInlineAttachments(inlineAttachments, markup),
    [inlineAttachments, markup],
  );
  const attachmentsToResolveRef = useRef(attachmentsToResolve);
  attachmentsToResolveRef.current = attachmentsToResolve;
  const attachmentKey = useMemo(
    () =>
      attachmentsToResolve
        .map(
          (attachment) =>
            `${attachment.attachmentId}:${attachment.contentId ?? ""}`,
        )
        .join("|"),
    [attachmentsToResolve],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (!markup) {
      if (host.shadowRoot) host.shadowRoot.innerHTML = "";
      return;
    }

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.innerHTML = `${buildEmailShadowStyles(canvas)}${markup}`;
    collapseHtmlEmailQuotes(shadow);

    const attachments = attachmentsToResolveRef.current;
    const cachedUrls = applyCachedInlineAttachments(
      shadow,
      attachments,
      peekInlineAttachmentRef.current,
    );

    const loader = loadInlineAttachmentRef.current;
    if (!loader || attachments.length === 0) {
      return () => {
        for (const objectUrl of cachedUrls) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }

    let cancelled = false;
    const objectUrls = [...cachedUrls];

    void Promise.all(
      attachments.map(async (attachment) => {
        const contentId = normalizeEmailContentId(attachment.contentId);
        if (!contentId || isInlineContentResolved(shadow, contentId)) return;

        const cached = peekInlineAttachmentRef.current?.(
          attachment.attachmentId,
        );
        if (cached) {
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(cached);
          objectUrls.push(objectUrl);
          applyInlineAttachmentUrls(shadow, contentId, objectUrl);
          return;
        }

        try {
          const blob = await loader(attachment.attachmentId);
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          objectUrls.push(objectUrl);
          applyInlineAttachmentUrls(shadow, contentId, objectUrl);
        } catch {
          // Leave the placeholder hidden when fetch fails.
        }
      }),
    );

    return () => {
      cancelled = true;
      for (const objectUrl of objectUrls) {
        URL.revokeObjectURL(objectUrl);
      }
    };
    // attachmentKey stands in for attachmentsToResolve identity — a new array
    // each parent render must not remount the shadow tree (cid avatar flicker).
  }, [attachmentKey, canvas, markup]);

  if (!markup) {
    return fallback ? (
      <div className="email-thread-message__html-body">{fallback}</div>
    ) : null;
  }

  return (
    <div
      ref={hostRef}
      className={[
        "email-thread-message__html-host",
        canvas === "light"
          ? "email-thread-message__html-host--light"
          : "email-thread-message__html-host--dark",
      ].join(" ")}
      data-email-html-canvas={canvas}
    />
  );
}
