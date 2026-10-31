"use client";

import { useMemo } from "react";
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
                {item.faviconUrl ? (
                  <img
                    src={item.faviconUrl}
                    alt=""
                    className="chat-ui-link-preview__favicon"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
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
