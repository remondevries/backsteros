import { useEffect, useRef, useState } from "react";

import {
  getPresentationDeliveryMode,
  type PresentationKind,
  type PresentationViewportPhase,
} from "../presentation";
import {
  PRESENTATION_SWAP_IN_MS,
  PRESENTATION_SWAP_OUT_MS,
} from "../presentation-timing";
import { PresentationIframeSurface } from "./PresentationIframeSurface";
import { PresentationViewportSurface } from "./PresentationViewportSurface";

type PresentationSurfaceProps = {
  kind: PresentationKind;
  url: string | null;
  onUrlChange: (url: string | null) => void;
  isBroadcasting: boolean;
  viewportPhase: PresentationViewportPhase;
  viewportError: string | null;
  previewStream: MediaStream | null;
  onBroadcast: () => void;
  onStopBroadcast: () => void;
};

export function PresentationSurface({
  kind,
  url,
  onUrlChange,
  isBroadcasting,
  viewportPhase,
  viewportError,
  previewStream,
  onBroadcast,
  onStopBroadcast,
}: PresentationSurfaceProps) {
  const [shownKind, setShownKind] = useState(kind);
  const [swapClass, setSwapClass] = useState("");
  const shownRef = useRef(kind);

  useEffect(() => {
    if (kind === shownRef.current) return;
    let cancelled = false;
    setSwapClass("is-swap-out");
    const outTimer = window.setTimeout(() => {
      if (cancelled) return;
      shownRef.current = kind;
      setShownKind(kind);
      setSwapClass("is-swap-in");
      window.setTimeout(() => {
        if (!cancelled) setSwapClass("");
      }, PRESENTATION_SWAP_IN_MS);
    }, PRESENTATION_SWAP_OUT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(outTimer);
    };
  }, [kind]);

  const deliveryMode = getPresentationDeliveryMode(shownKind);

  if (deliveryMode === "viewport") {
    return (
      <PresentationViewportSurface
        viewportPhase={viewportPhase}
        viewportError={viewportError}
        previewStream={previewStream}
        isBroadcasting={isBroadcasting}
        onBroadcast={onBroadcast}
        onStopBroadcast={onStopBroadcast}
        swapClass={swapClass}
      />
    );
  }

  return (
    <PresentationIframeSurface
      kind={shownKind}
      url={url}
      onUrlChange={onUrlChange}
      isBroadcasting={isBroadcasting}
      onBroadcast={onBroadcast}
      onStopBroadcast={onStopBroadcast}
      swapClass={swapClass}
    />
  );
}
