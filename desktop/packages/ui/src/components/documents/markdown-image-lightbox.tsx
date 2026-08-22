"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";

export type MarkdownImageLightboxProps = {
  src: string;
  alt: string;
  sourceRect: DOMRect;
  onClose: () => void;
};

/**
 * Linear Now–style image zoom: scale from the thumbnail rect to a centered
 * viewport-fit size over a dimmed backdrop. Escape / backdrop click closes.
 */
export function MarkdownImageLightbox({
  src,
  alt,
  sourceRect,
  onClose,
}: MarkdownImageLightboxProps) {
  const titleId = useId();
  const [active, setActive] = useState(false);
  const [closing, setClosing] = useState(false);
  const closedRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  const scale = Math.min(
    (window.innerWidth * 0.92) / Math.max(sourceRect.width, 1),
    (window.innerHeight * 0.92) / Math.max(sourceRect.height, 1),
  );
  const translateX =
    window.innerWidth / 2 - (sourceRect.left + sourceRect.width / 2);
  const translateY =
    window.innerHeight / 2 - (sourceRect.top + sourceRect.height / 2);

  function finishClose() {
    if (closedRef.current) return;
    closedRef.current = true;
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    onClose();
  }

  function beginClose() {
    if (closing || closedRef.current) return;
    setClosing(true);
    setActive(false);
    closeTimerRef.current = window.setTimeout(() => {
      finishClose();
    }, 400);
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setActive(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        beginClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
    // beginClose closes over the mount lifetime only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTransitionEnd(event: TransitionEvent<HTMLImageElement>) {
    if (event.propertyName !== "transform") return;
    if (closing) finishClose();
  }

  return createPortal(
    <div
      className={[
        "markdown-image-lightbox",
        active && !closing ? "markdown-image-lightbox--open" : "",
        closing ? "markdown-image-lightbox--closing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-blocking-modal=""
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="markdown-image-lightbox__backdrop"
        aria-label="Close image"
        onClick={beginClose}
      />
      <span id={titleId} className="markdown-image-lightbox__title">
        {alt || "Image preview"}
      </span>
      <img
        src={src}
        alt={alt}
        className="markdown-image-lightbox__image"
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        onTransitionEnd={handleTransitionEnd}
        style={{
          top: sourceRect.top,
          left: sourceRect.left,
          width: sourceRect.width,
          height: sourceRect.height,
          transform: active
            ? `translate(${translateX}px, ${translateY}px) scale(${scale})`
            : "translate(0, 0) scale(1)",
        }}
      />
    </div>,
    document.body,
  );
}
