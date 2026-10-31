"use client";

import { useMemo, useState } from "react";
import type {
  ChatUiCardPart,
  ChatUiLinkPreviewsCardData,
} from "@backsteros/contracts";
import { chatUiLinkPreviewsCardDataSchema } from "@backsteros/contracts";

function parseLinkPreviewsData(
  part: ChatUiCardPart,
): ChatUiLinkPreviewsCardData | null {
  const parsed = chatUiLinkPreviewsCardDataSchema.safeParse(part.data ?? {});
  return parsed.success ? parsed.data : null;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function LinkPreviewFavicon({
  src,
  site,
}: {
  src: string | null | undefined;
  site: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src?.trim()) && !failed;

  if (showImage) {
    return (
      <img
        src={src!}
        alt=""
        className="chat-ui-link-preview__favicon"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className="chat-ui-link-preview__favicon-fallback"
      aria-hidden
      title={site}
    >
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M1.75 8h12.5M8 1.75c1.8 1.9 2.7 3.9 2.7 6.25S9.8 12.35 8 14.25C6.2 12.35 5.3 10.35 5.3 8S6.2 3.65 8 1.75Z" />
      </svg>
    </span>
  );
}

export function ChatLinkPreviewsCard({ part }: { part: ChatUiCardPart }) {
  const data = useMemo(() => parseLinkPreviewsData(part), [part]);
  if (!data) return null;

  return (
    <div className="chat-ui-link-previews" role="list">
      {data.items.map((item) => {
        const site = item.siteName?.trim() || hostnameOf(item.url);
        const title = item.title?.trim() || site;
        return (
          <a
            key={item.url}
            className="chat-ui-link-preview"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            role="listitem"
          >
            <span className="chat-ui-link-preview__body">
              <span className="chat-ui-link-preview__site">
                <LinkPreviewFavicon src={item.faviconUrl} site={site} />
                {site}
              </span>
              <span className="chat-ui-link-preview__title">{title}</span>
              {item.description?.trim() ? (
                <span className="chat-ui-link-preview__desc">
                  {item.description.trim()}
                </span>
              ) : null}
            </span>
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="chat-ui-link-preview__image"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : null}
          </a>
        );
      })}
    </div>
  );
}

export function findLinkPreviewsCardPart(
  parts: readonly { type: string; cardType?: string }[],
): ChatUiCardPart | null {
  for (const part of parts) {
    if (part.type === "card" && part.cardType === "link-previews") {
      return part as ChatUiCardPart;
    }
  }
  return null;
}
