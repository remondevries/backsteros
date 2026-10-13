import { useEffect, useRef } from "react";

import { usePresentationFloatChrome } from "../hooks/use-presentation-float-chrome";
import type { PresentationViewportPhase } from "../presentation";
import { PresentationBroadcastButton } from "./PresentationBroadcastBar";

type PresentationViewportSurfaceProps = {
  viewportPhase: PresentationViewportPhase;
  viewportError: string | null;
  previewStream: MediaStream | null;
  isBroadcasting: boolean;
  onBroadcast: () => void;
  onStopBroadcast: () => void;
  swapClass: string;
};

export function PresentationViewportSurface({
  viewportPhase,
  viewportError,
  previewStream,
  isBroadcasting,
  onBroadcast,
  onStopBroadcast,
  swapClass,
}: PresentationViewportSurfaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { visible, reveal, chromeProps } = usePresentationFloatChrome();
  const isPreparing = viewportPhase === "preparing";
  const showPreview = Boolean(previewStream);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (previewStream) {
      video.srcObject = previewStream;
      void video.play().catch(() => undefined);
      return;
    }
    video.srcObject = null;
  }, [previewStream]);

  return (
    <div
      className={[
        "director__presentation-pane",
        "director__presentation-pane--viewport",
        "director__presentation-pane--overlay",
        isBroadcasting ? "is-broadcasting" : null,
        showPreview ? "is-sharing" : null,
        swapClass,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="director__presentation-share-stage">
        {showPreview ? (
          <video
            ref={videoRef}
            className="director__presentation-share-video"
            autoPlay
            playsInline
            muted
            aria-label="Shared screen preview"
          />
        ) : (
          <div className="director__presentation-share-empty">
            <div className="director__presentation-share-badge" aria-hidden>
              <span className="director__presentation-share-badge-icon">▣</span>
            </div>
            <p className="director__presentation-title">Share a window</p>
            <p className="director__presentation-copy">
              Press <strong>Broadcast</strong>, then pick a browser tab, app
              window, or display. Guests only see it once broadcast is on — this
              panel shows the same feed.
            </p>
          </div>
        )}
      </div>

      <div
        className="director__presentation-float-hit"
        aria-hidden
        onPointerEnter={reveal}
        onPointerMove={reveal}
      />

      <div
        className={[
          "director__presentation-float-layer",
          visible ? "is-visible" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        {...chromeProps}
      >
        <header className="director__presentation-float-bar">
          <div className="director__presentation-share-actions">
            <div className="director__presentation-viewport-status">
              <span
                className={[
                  "director__presentation-viewport-dot",
                  viewportPhase !== "idle" ? "is-active" : "",
                  viewportPhase === "error" ? "is-error" : "",
                  viewportPhase === "live" ? "is-live" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden
              />
              <span className="director__presentation-viewport-label">
                {showPreview
                  ? isBroadcasting
                    ? "Broadcasting this feed"
                    : "Preview only — not broadcast yet"
                  : isPreparing
                    ? "Waiting for share picker…"
                    : "Not sharing"}
              </span>
              {viewportError ? (
                <span className="director__presentation-viewport-error">
                  {viewportError}
                </span>
              ) : null}
            </div>
            <PresentationBroadcastButton
              isBroadcasting={isBroadcasting}
              disabled={isPreparing}
              onBroadcast={onBroadcast}
              onStopBroadcast={onStopBroadcast}
            />
          </div>
        </header>
      </div>
    </div>
  );
}
