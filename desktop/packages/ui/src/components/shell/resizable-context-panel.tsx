"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const clamp = (value: number) => Math.min(420, Math.max(210, value));

/** Match agent-rail collapse duration. */
export const CONTEXT_PANEL_COLLAPSE_DURATION_MS = 220;

export type ResizableContextPanelProps = {
  children: ReactNode;
  storageKey: string;
  defaultWidth?: number;
  /** User-collapsed via ⇧[ — width animates to 0. */
  collapsed?: boolean;
  /** True while width is interpolating open/closed. */
  animating?: boolean;
};

/**
 * Resizable left context panel inside the content frame.
 * Matches `backsteros-app` ResizablePanel / `.context-panel`.
 *
 * Collapse animates this panel's own width in the flex layout (no content-frame
 * grid). Content stays hidden during the slide, then fades in when settled.
 */
export function ResizableContextPanel({
  children,
  storageKey,
  defaultWidth = 244,
  collapsed = false,
  animating = false,
}: ResizableContextPanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const widthRef = useRef(width);

  useEffect(() => {
    const stored = Number(localStorage.getItem(storageKey));
    if (!Number.isFinite(stored) || stored <= 0) return;
    const frame = requestAnimationFrame(() => setWidth(clamp(stored)));
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (collapsed) return;
      event.preventDefault();
      const handle = event.currentTarget;
      const origin = event.clientX;
      const initial = widthRef.current;
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("is-resizing");

      const move = (next: PointerEvent) => {
        const nextWidth = clamp(initial + next.clientX - origin);
        widthRef.current = nextWidth;
        setWidth(nextWidth);
      };
      const finish = () => {
        localStorage.setItem(storageKey, String(widthRef.current));
        document.body.classList.remove("is-resizing");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    },
    [collapsed, storageKey],
  );

  return (
    <aside
      className={`context-panel${collapsed ? " is-collapsed" : ""}${
        animating ? " is-collapse-animating" : ""
      }`}
      style={{ width: collapsed ? 0 : width }}
      aria-hidden={collapsed || undefined}
      {...(collapsed ? { inert: true } : {})}
    >
      {/*
        Keep inner chrome at the stored width while the aside clips 0↔width.
        Avoids padding/list layout changing the outer size when content fades in.
      */}
      <div
        className="context-panel__body"
        style={{ width, minWidth: width, maxWidth: width }}
      >
        {children}
      </div>
      {collapsed ? null : (
        <div
          className="resize-handle"
          role="separator"
          aria-label="Resize context panel"
          aria-orientation="vertical"
          aria-valuemin={210}
          aria-valuemax={420}
          aria-valuenow={width}
          onPointerDown={startResize}
        />
      )}
    </aside>
  );
}
