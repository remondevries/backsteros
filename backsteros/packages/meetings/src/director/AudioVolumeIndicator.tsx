import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 3;
const MAX_HEIGHT_PX = 12;
const RING_NOISE_FLOOR = 0.008;
const RING_SPEECH_LEVEL = 0.1;

type AudioVolumeIndicatorProps = {
  /** 0–1 LiveKit / analyser level */
  level: number;
  className?: string;
};

export function normalizeAudioLevel(level: number): number {
  const gated = Math.max(0, level - RING_NOISE_FLOOR);
  if (gated === 0) return 0;
  return Math.min(
    1,
    Math.pow(gated / (RING_SPEECH_LEVEL - RING_NOISE_FLOOR), 0.8),
  );
}

/**
 * Compact Stream-style audio volume ticks (last N levels as bar heights).
 * Uses the same gated microphone mapping as the avatar outline rings.
 * https://getstream.io/video/docs/ios/ui-cookbook/audio-volume-indicator/
 */
export function AudioVolumeIndicator({
  level,
  className,
}: AudioVolumeIndicatorProps) {
  const historyRef = useRef<number[]>(Array.from({ length: BAR_COUNT }, () => 0));
  const [bars, setBars] = useState(() => historyRef.current.slice());

  useEffect(() => {
    const display = normalizeAudioLevel(level);
    const history = historyRef.current;
    history.shift();
    history.push(display);
    setBars(history.slice());
  }, [level]);

  return (
    <div
      className={["audio-vu", className].filter(Boolean).join(" ")}
      aria-hidden
    >
      {bars.map((value, index) => (
        <span
          key={index}
          className="audio-vu__bar"
          style={{
            height: `${value <= 0 ? 0 : Math.max(2, value * MAX_HEIGHT_PX)}px`,
            opacity: value <= 0 ? 0 : 1,
          }}
        />
      ))}
    </div>
  );
}
