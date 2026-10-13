import { useCallback } from "react";

type GuestPipVideoProps = {
  identity: string;
  bind: (identity: string, el: HTMLVideoElement | null) => void;
  className?: string;
};

/**
 * Stable callback ref so parent VU / audio re-renders do not re-fire the
 * LiveKit attach (inline `ref={el => …}` would detach/reattach every tick).
 */
export function GuestPipVideo({
  identity,
  bind,
  className = "director__guest-video",
}: GuestPipVideoProps) {
  const setRef = useCallback(
    (el: HTMLVideoElement | null) => bind(identity, el),
    [bind, identity],
  );

  return (
    <video className={className} autoPlay playsInline muted={false} ref={setRef} />
  );
}
