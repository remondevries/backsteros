"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

function EmailCopyIcon({ size = 12 }: { size?: number }) {
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

function EmailCopiedIcon({ size = 12 }: { size?: number }) {
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

export type EmailAddressCopyRowProps = {
  /** Bare address written to the clipboard. Hidden when empty. */
  email: string | null | undefined;
  /** Optional visible address / chip; omit for an icon-only control. */
  children?: ReactNode;
  className?: string;
  /**
   * When false, children stay non-button (e.g. contact dropdown) and only
   * the clipboard icon copies. Defaults to true.
   */
  valueClickable?: boolean;
};

/**
 * Hover/focus-reveal clipboard control — same pattern as API key prefix copy.
 * Clicking the address or the icon copies the bare email.
 */
export function EmailAddressCopyRow({
  email,
  children,
  className,
  valueClickable = true,
}: EmailAddressCopyRowProps) {
  const trimmed = email?.trim() || "";
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  if (!trimmed) {
    return className ? (
      <span className={className}>{children}</span>
    ) : (
      <>{children}</>
    );
  }

  const copy = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void navigator.clipboard
      ?.writeText(trimmed)
      .then(() => {
        setCopied(true);
        if (copiedTimerRef.current != null) {
          window.clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          copiedTimerRef.current = null;
        }, 1500);
      })
      .catch(() => {
        /* clipboard permission denied */
      });
  };

  const copyLabel = copied ? "Copied" : `Copy ${trimmed}`;
  const hasVisibleAddress = children != null && children !== false;

  return (
    <span
      className={[
        "email-address-copy-row",
        copied ? "email-address-copy-row--copied" : null,
        !hasVisibleAddress ? "email-address-copy-row--icon-only" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasVisibleAddress ? (
        valueClickable ? (
          <button
            type="button"
            className="email-address-copy-value"
            aria-label={copyLabel}
            title={copyLabel}
            onClick={copy}
          >
            {children}
          </button>
        ) : (
          children
        )
      ) : null}
      <button
        type="button"
        className="email-address-copy-btn"
        aria-label={copyLabel}
        title={copyLabel}
        tabIndex={hasVisibleAddress && valueClickable ? -1 : 0}
        onClick={copy}
      >
        {copied ? <EmailCopiedIcon /> : <EmailCopyIcon />}
      </button>
    </span>
  );
}
