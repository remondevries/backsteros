"use client";

import { Fragment, type ReactNode } from "react";

import { splitPlainTextWithUrls } from "../../text/linkify-plain-text.js";

export type LinkifiedPlainTextProps = {
  text: string;
  /** Class for auto-linked anchors (defaults to markdown preview link chrome). */
  linkClassName?: string;
};

/** Render plain text with http(s)/www URLs as external anchors. */
export function LinkifiedPlainText({
  text,
  linkClassName = "content-markdown-preview-link",
}: LinkifiedPlainTextProps): ReactNode {
  const parts = splitPlainTextWithUrls(text);
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "text") {
          return <Fragment key={index}>{part.text}</Fragment>;
        }
        return (
          <a
            key={index}
            href={part.href}
            className={linkClassName}
            target="_blank"
            rel="noreferrer noopener"
          >
            {part.text}
          </a>
        );
      })}
    </>
  );
}
