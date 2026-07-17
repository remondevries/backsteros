"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

type ResizableBottomPanelProps = {
  children: ReactNode;
  storageKey: string;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  maxHeightRatio?: number;
  containerRef?: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLElement | null>;
  className?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function readStoredPanelHeight(
  storageKey: string,
  defaultHeight: number,
  minHeight: number,
  maxHeight: number,
) {
  if (typeof window === "undefined") {
    return defaultHeight;
  }

  const stored = window.localStorage.getItem(storageKey);
  const parsed = stored ? Number(stored) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return defaultHeight;
  }

  return clamp(parsed, minHeight, maxHeight);
}

export function ResizableBottomPanel({
  children,
  storageKey,
  defaultHeight = 360,
  minHeight = 160,
  maxHeight = 1200,
  maxHeightRatio = 0.78,
  containerRef,
  panelRef,
  className,
}: ResizableBottomPanelProps) {
  const [height, setHeight] = useState(defaultHeight);
  const [isResizing, setIsResizing] = useState(false);
  const heightRef = useRef(height);
  const isResizingRef = useRef(false);

  const resolveMaxHeight = useCallback(() => {
    if (maxHeightRatio != null && containerRef?.current) {
      return Math.max(
        minHeight,
        Math.min(maxHeight, containerRef.current.clientHeight * maxHeightRatio),
      );
    }
    return maxHeight;
  }, [containerRef, maxHeight, maxHeightRatio, minHeight]);

  useEffect(() => {
    if (isResizingRef.current) return;
    setHeight(
      clamp(
        readStoredPanelHeight(storageKey, defaultHeight, minHeight, maxHeight),
        minHeight,
        resolveMaxHeight(),
      ),
    );
  }, [defaultHeight, maxHeight, minHeight, resolveMaxHeight, storageKey]);

  useEffect(() => {
    heightRef.current = height;
  }, [height]);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (isResizingRef.current) return;
      const nextMax = resolveMaxHeight();
      setHeight((current) => clamp(current, minHeight, nextMax));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, minHeight, resolveMaxHeight]);

  const persistHeight = useCallback(
    (nextHeight: number) => {
      window.localStorage.setItem(storageKey, String(nextHeight));
    },
    [storageKey],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const startY = event.clientY;
      const startHeight = heightRef.current;
      setIsResizing(true);
      isResizingRef.current = true;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      function handlePointerMove(moveEvent: PointerEvent) {
        const delta = startY - moveEvent.clientY;
        const nextHeight = clamp(
          startHeight + delta,
          minHeight,
          resolveMaxHeight(),
        );
        heightRef.current = nextHeight;
        setHeight(nextHeight);
      }

      function finishResize(upEvent: PointerEvent) {
        setIsResizing(false);
        isResizingRef.current = false;
        document.body.style.userSelect = previousUserSelect;
        persistHeight(heightRef.current);
        handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener("pointermove", handlePointerMove);
        handle.removeEventListener("pointerup", finishResize);
        handle.removeEventListener("pointercancel", finishResize);
      }

      handle.addEventListener("pointermove", handlePointerMove);
      handle.addEventListener("pointerup", finishResize);
      handle.addEventListener("pointercancel", finishResize);
    },
    [minHeight, persistHeight, resolveMaxHeight],
  );

  const style: CSSProperties = {
    height,
  };

  return (
    <aside
      ref={panelRef}
      className={["resizable-bottom-panel", className].filter(Boolean).join(" ")}
      style={style}
      data-resizing={isResizing ? "true" : undefined}
    >
      <div
        className="resizable-bottom-panel-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize PDF panel"
        onPointerDown={handlePointerDown}
      />
      <div className="resizable-bottom-panel-body min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </aside>
  );
}
