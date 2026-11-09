"use client";

import { useEffect, useRef, useState } from "react";

/** True when Details should offer a guest room link to copy. */
export function shouldShowMeetingRoomLinkCopy(
  roomGuestUrl: string | null | undefined,
): boolean {
  return Boolean(roomGuestUrl?.trim());
}

export type MeetingRoomLinkCopyProps = {
  /** Guest portal lobby URL (`…/meet/:id`). */
  url: string;
};

/**
 * Details-tab control — copy the shareable guest room URL to the clipboard.
 */
export function MeetingRoomLinkCopy({ url }: MeetingRoomLinkCopyProps) {
  const trimmed = url.trim();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!trimmed) return null;

  const copy = () => {
    void navigator.clipboard
      ?.writeText(trimmed)
      .then(() => {
        setCopied(true);
        if (timerRef.current != null) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
          setCopied(false);
          timerRef.current = null;
        }, 1500);
      })
      .catch(() => {
        setCopied(false);
      });
  };

  return (
    <div className="meeting-room-link-copy">
      <div className="meeting-room-link-copy__meta">
        <p className="meeting-room-link-copy__label">Room link</p>
        <p className="meeting-room-link-copy__url" title={trimmed}>
          {trimmed}
        </p>
      </div>
      <button
        type="button"
        className="meeting-attendee-email-list__button meeting-room-link-copy__button"
        onClick={copy}
        aria-label={copied ? "Room link copied" : "Copy room link"}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
