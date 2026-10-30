"use client";

import { useEffect, useRef } from "react";
import {
  MODE_DRAWS,
  resolvePreset,
  type OrbSize,
  type OrbState,
  type Resolved,
} from "thinking-orbs";

/**
 * At the 20px chrome scale the tuned presets keep strokes hairline-thin.
 * Bump the radius / width keys the engine already understands so the
 * constellation reads at icon size.
 */
function inlineOrbOpts(size: OrbSize, opts: Resolved["opts"]): Resolved["opts"] {
  if (size !== 20) return opts;

  const scale = (key: string, factor: number) => {
    const value = opts[key];
    return typeof value === "number" ? value * factor : undefined;
  };

  return {
    ...opts,
    nodeR: scale("nodeR", 1.85) ?? opts.nodeR,
    nodeRDepth: scale("nodeRDepth", 1.85) ?? opts.nodeRDepth,
    lineW: scale("lineW", 2.25) ?? opts.lineW,
    partR: scale("partR", 1.7) ?? opts.partR,
    partRDepth: scale("partRDepth", 1.7) ?? opts.partRDepth,
    ghostR: scale("ghostR", 1.55) ?? opts.ghostR,
  };
}

/**
 * Always-animating solving orb for the chat chrome toggle.
 * `ThinkingOrb` freezes under prefers-reduced-motion; this control is a
 * deliberate affordance, so we drive the engine ourselves.
 * @see https://libraries.dev/orbs — state "solving"
 */
export function ChatPanelToggleOrb({
  size = 20,
  className,
  state = "solving",
  paused = false,
}: {
  readonly size?: OrbSize;
  readonly className?: string | undefined;
  readonly state?: OrbState;
  /** When true, paint a still frame (e.g. chat panel collapsed). */
  readonly paused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(
      2,
      typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1,
    );
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isDark = true;
    const resolved = resolvePreset(state, size);
    const opts = inlineOrbOpts(size, resolved.opts);
    const draw = MODE_DRAWS[resolved.mode];
    if (!draw) return;

    let raf = 0;
    let running = false;

    const paint = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      draw(ctx, size, t, isDark, opts);
    };

    const tick = () => {
      paint((performance.now() / 1000) * resolved.speed);
      if (running) raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    paint((performance.now() / 1000) * resolved.speed);

    const onVisibility = () => {
      if (document.visibilityState === "hidden" || paused) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (!paused && document.visibilityState !== "hidden") start();
    else stop();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [size, state, paused]);

  return (
    <span
      className={className}
      data-chat-panel-toggle-orb=""
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        lineHeight: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Chat panel"
        style={{ width: size, height: size, display: "block" }}
      />
    </span>
  );
}
