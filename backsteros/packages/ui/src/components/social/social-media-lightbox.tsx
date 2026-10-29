"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { MarkdownImageLightbox } from "../documents/markdown-image-lightbox.js";

export type SocialMediaLightboxProps = {
  src: string;
  kind: "image" | "video";
  alt?: string;
  sourceRect: DOMRect;
  onClose: () => void;
};

/**
 * Full-app media preview — images use the shared zoom lightbox; video gets a
 * dimmed fullscreen player. Escape / backdrop closes.
 */
export function SocialMediaLightbox({
  src,
  kind,
  alt = "",
  sourceRect,
  onClose,
}: SocialMediaLightboxProps) {
  if (kind === "image") {
    return (
      <MarkdownImageLightbox
        src={src}
        alt={alt || "Image preview"}
        sourceRect={sourceRect}
        onClose={onClose}
      />
    );
  }

  return (
    <SocialVideoLightbox src={src} alt={alt || "Video preview"} onClose={onClose} />
  );
}

function SocialVideoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const closedRef = useRef(false);

  function finishClose() {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }

  function beginClose() {
    setOpen(false);
    window.setTimeout(finishClose, 200);
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className={[
        "social-media-lightbox",
        open ? "social-media-lightbox--open" : null,
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
        className="social-media-lightbox__backdrop"
        aria-label="Close video"
        onClick={beginClose}
      />
      <span id={titleId} className="social-media-lightbox__title">
        {alt}
      </span>
      <video
        className="social-media-lightbox__video"
        src={src}
        controls
        autoPlay
        playsInline
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
