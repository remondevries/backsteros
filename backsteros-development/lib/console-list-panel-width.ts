"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

export const CONSOLE_LIST_PANEL_WIDTH_KEY = "console-list-panel-width";
export const CONSOLE_LIST_PANEL_MIN_WIDTH = 360;
export const CONSOLE_LIST_PANEL_DEFAULT_WIDTH = 360;
export const CONSOLE_LIST_PANEL_MAX_WIDTH = 720;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStoredWidth(): number {
  if (typeof window === "undefined") return CONSOLE_LIST_PANEL_DEFAULT_WIDTH;
  const parsed = Number(window.localStorage.getItem(CONSOLE_LIST_PANEL_WIDTH_KEY));
  if (!Number.isFinite(parsed)) return CONSOLE_LIST_PANEL_DEFAULT_WIDTH;
  return clamp(
    parsed,
    CONSOLE_LIST_PANEL_MIN_WIDTH,
    CONSOLE_LIST_PANEL_MAX_WIDTH,
  );
}

export function useConsoleListPanelWidth(enabled: boolean) {
  const [width, setWidth] = useState(CONSOLE_LIST_PANEL_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setWidth(readStoredWidth());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const resolveMaxWidth = useCallback(() => {
    const frameWidth = frameRef.current?.clientWidth ?? 0;
    if (frameWidth <= 0) return CONSOLE_LIST_PANEL_MAX_WIDTH;
    return Math.max(
      CONSOLE_LIST_PANEL_MIN_WIDTH,
      Math.min(CONSOLE_LIST_PANEL_MAX_WIDTH, Math.floor(frameWidth * 0.7)),
    );
  }, []);

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth = widthRef.current;
      const maxWidth = resolveMaxWidth();
      setIsResizing(true);
      document.body.classList.add("is-resizing");
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const onMove = (moveEvent: PointerEvent) => {
        const next = clamp(
          startWidth + (moveEvent.clientX - startX),
          CONSOLE_LIST_PANEL_MIN_WIDTH,
          maxWidth,
        );
        widthRef.current = next;
        setWidth(next);
      };

      const onFinish = (upEvent: PointerEvent) => {
        setIsResizing(false);
        document.body.classList.remove("is-resizing");
        document.body.style.userSelect = previousUserSelect;
        window.localStorage.setItem(
          CONSOLE_LIST_PANEL_WIDTH_KEY,
          String(widthRef.current),
        );
        handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onFinish);
        handle.removeEventListener("pointercancel", onFinish);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onFinish);
      handle.addEventListener("pointercancel", onFinish);
    },
    [enabled, resolveMaxWidth],
  );

  const frameStyle: CSSProperties | undefined = enabled
    ? ({
        ["--console-list-width" as string]: `${width}px`,
      } as CSSProperties)
    : undefined;

  return {
    width,
    isResizing,
    frameRef,
    frameStyle,
    onResizePointerDown,
  };
}
