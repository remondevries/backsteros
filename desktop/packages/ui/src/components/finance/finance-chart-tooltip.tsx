"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type FinanceChartTooltipProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Chart tooltip shell that portals to `document.body` with `position: fixed`.
 * Nivo mounts tooltips inside overflow-clipped panes (detail side panels,
 * sticky headers); this keeps the bubble fully visible while still leaving an
 * in-tree measured copy so Nivo's anchor math stays correct.
 */
export function FinanceChartTooltip({
  children,
  className,
}: FinanceChartTooltipProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    left: 0,
    top: 0,
    zIndex: 10_000,
    pointerEvents: "none",
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const measure = measureRef.current;
    if (!measure || typeof document === "undefined") return;

    let host: HTMLElement | null = measure.parentElement;
    while (host && host !== document.body) {
      const { position } = getComputedStyle(host);
      if (position === "absolute" || position === "fixed") break;
      host = host.parentElement;
    }
    if (!host) return;

    let frame = 0;
    const update = () => {
      const rect = host!.getBoundingClientRect();
      setStyle({
        position: "fixed",
        left: rect.left,
        top: rect.top,
        zIndex: 10_000,
        pointerEvents: "none",
        visibility: "visible",
      });
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <div
        ref={measureRef}
        className={className}
        style={{ visibility: "hidden", pointerEvents: "none" }}
        aria-hidden="true"
      >
        {children}
      </div>
      {createPortal(
        <div className={className} style={style} role="tooltip">
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
