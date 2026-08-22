"use client";

import { useEffect, useMemo, useRef } from "react";

import {
  buildEmailShadowStyles,
  normalizeEmailContentId,
  prepareEmailHtmlForDisplay,
  resolveEmailInlineAttachments,
  type EmailMessageInlineAttachment,
} from "../../email/email-message-html.js";

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
  const attachmentsToResolve = useMemo(
    () => resolveEmailInlineAttachments(inlineAttachments, markup),
    [inlineAttachments, markup],
  );
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
    shadow.innerHTML = `${buildEmailShadowStyles()}${markup}`;

    const cachedUrls = applyCachedInlineAttachments(
      shadow,
      attachmentsToResolve,
      peekInlineAttachmentRef.current,
    );

    const loader = loadInlineAttachmentRef.current;
    if (!loader || attachmentsToResolve.length === 0) {
      return () => {
        for (const objectUrl of cachedUrls) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }

    let cancelled = false;
    const objectUrls = [...cachedUrls];

    void Promise.all(
      attachmentsToResolve.map(async (attachment) => {
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
  }, [attachmentKey, attachmentsToResolve, markup]);

  if (!markup) {
    return fallback ? (
      <div className="email-thread-message__html-body">{fallback}</div>
    ) : null;
  }

  return <div ref={hostRef} className="email-thread-message__html-host" />;
}
