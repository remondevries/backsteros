"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { extractMermaidSourceFromCodeChildren } from "../../documents/markdown-doc-diagrams.js";

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8.354 4.25a2.75 2.75 0 0 1 2.646-2h2a2.75 2.75 0 0 1 2.646 2H17A2.75 2.75 0 0 1 19.75 7v12A2.75 2.75 0 0 1 17 21.75H7A2.75 2.75 0 0 1 4.25 19V7A2.75 2.75 0 0 1 7 4.25zM11 3.75c-.69 0-1.25.56-1.25 1.25v1.25h4.5V5c0-.69-.56-1.25-1.25-1.25z" />
    </svg>
  );
}

function CopiedIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.577 6.183a1 1 0 0 1 .24 1.394l-5.666 8.02c-.36.508-.665.94-.94 1.269-.287.34-.61.658-1.038.86a2.83 2.83 0 0 1-2.03.153c-.456-.137-.82-.406-1.149-.702-.315-.285-.672-.668-1.09-1.116l-1.635-1.753a1 1 0 1 1 1.462-1.364l1.606 1.722c.455.487.754.806.998 1.027.24.216.344.259.385.271.196.06.405.045.598-.046.046-.022.149-.085.36-.338.216-.257.473-.62.863-1.171l5.642-7.986a1 1 0 0 1 1.394-.24" />
    </svg>
  );
}

export type MarkdownCodeBlockProps = {
  children: ReactNode;
  className?: string | null;
};

/**
 * Fenced markdown `<pre>` with a hover-reveal clipboard button (top-right).
 * Used by DocumentMarkdownPreview (chat + document preview).
 */
export function MarkdownCodeBlock({
  children,
  className,
}: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const copy = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const text = (extractMermaidSourceFromCodeChildren(children) ?? "")
      .replace(/\n$/, "");
    if (!text) return;
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        if (timerRef.current != null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setCopied(false);
          timerRef.current = null;
        }, 1500);
      })
      .catch(() => {
        /* clipboard denied */
      });
  };

  const label = copied ? "Copied" : "Copy code";

  return (
    <div className={["md-code-block", copied ? "is-copied" : ""].filter(Boolean).join(" ")}>
      <button
        type="button"
        className="md-code-block__copy"
        aria-label={label}
        title={label}
        onClick={copy}
      >
        {copied ? <CopiedIcon /> : <CopyIcon />}
      </button>
      <pre className={className ?? undefined}>{children}</pre>
    </div>
  );
}
