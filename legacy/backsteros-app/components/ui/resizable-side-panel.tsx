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

type ResizableSidePanelProps = {
  children: ReactNode;
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  maxWidthRatio?: number;
  containerRef?: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLElement | null>;
  className?: string;
  edge?: "start" | "end";
  legacyStorageKeys?: string[];
  fillAvailableSpace?: boolean;
};

export const RESIZABLE_SIDE_PANEL_LG_MEDIA_QUERY = "(min-width: 1024px)";

const LG_MEDIA_QUERY = RESIZABLE_SIDE_PANEL_LG_MEDIA_QUERY;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function readStoredPanelWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
  legacyStorageKeys: string[] = [],
) {
  if (typeof window === "undefined") {
    return defaultWidth;
  }

  const stored =
    window.localStorage.getItem(storageKey) ??
    legacyStorageKeys
      .map((key) => window.localStorage.getItem(key))
      .find((value) => value != null) ??
    null;
  const parsed = stored ? Number(stored) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return defaultWidth;
  }

  return clamp(parsed, minWidth, maxWidth);
}

export function ResizableSidePanel({
  children,
  storageKey,
  defaultWidth = 300,
  minWidth = 240,
  maxWidth = 480,
  maxWidthRatio,
  containerRef,
  panelRef,
  className,
  edge = "start",
  legacyStorageKeys = [],
  fillAvailableSpace = false,
}: ResizableSidePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);
  const isResizingRef = useRef(false);

  const resolveMaxWidth = useCallback(() => {
    if (maxWidthRatio != null && containerRef?.current) {
      return Math.max(
        minWidth,
        Math.min(maxWidth, containerRef.current.clientWidth * maxWidthRatio),
      );
    }

    return maxWidth;
  }, [containerRef, maxWidth, maxWidthRatio, minWidth]);

  useEffect(() => {
    if (isResizingRef.current) {
      return;
    }

    setWidth(
      clamp(
        readStoredPanelWidth(
          storageKey,
          defaultWidth,
          minWidth,
          maxWidth,
          legacyStorageKeys,
        ),
        minWidth,
        resolveMaxWidth(),
      ),
    );
  }, [
    defaultWidth,
    legacyStorageKeys,
    maxWidth,
    minWidth,
    resolveMaxWidth,
    storageKey,
  ]);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(LG_MEDIA_QUERY);

    function updateMatches() {
      setIsDesktop(mediaQuery.matches);
    }

    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);

    return () => mediaQuery.removeEventListener("change", updateMatches);
  }, []);

  const persistWidth = useCallback(
    (nextWidth: number) => {
      window.localStorage.setItem(storageKey, String(nextWidth));
    },
    [storageKey],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDesktop || fillAvailableSpace) {
        return;
      }

      event.preventDefault();

      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth = widthRef.current;
      setIsResizing(true);
      isResizingRef.current = true;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      function handlePointerMove(moveEvent: PointerEvent) {
        const delta =
          edge === "start"
            ? startX - moveEvent.clientX
            : moveEvent.clientX - startX;
        const nextWidth = clamp(startWidth + delta, minWidth, resolveMaxWidth());
        widthRef.current = nextWidth;
        setWidth(nextWidth);
      }

      function finishResize(upEvent: PointerEvent) {
        setIsResizing(false);
        isResizingRef.current = false;
        document.body.style.userSelect = previousUserSelect;
        persistWidth(widthRef.current);
        handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener("pointermove", handlePointerMove);
        handle.removeEventListener("pointerup", finishResize);
        handle.removeEventListener("pointercancel", finishResize);
      }

      handle.addEventListener("pointermove", handlePointerMove);
      handle.addEventListener("pointerup", finishResize);
      handle.addEventListener("pointercancel", finishResize);
    },
    [
      edge,
      fillAvailableSpace,
      isDesktop,
      minWidth,
      persistWidth,
      resolveMaxWidth,
    ],
  );

  const panelStyle: CSSProperties | undefined =
    isDesktop && !fillAvailableSpace
      ? {
          width: `${width}px`,
          flex: `0 0 ${width}px`,
          minWidth: 0,
          maxWidth: `${width}px`,
        }
      : fillAvailableSpace
        ? {
            flex: "1 1 0%",
            minWidth: 0,
            width: "auto",
            maxWidth: "none",
          }
        : undefined;

  const ariaMaxWidth = maxWidthRatio != null ? width : maxWidth;

  const handlePositionClass =
    edge === "start"
      ? "left-0 -translate-x-1/2"
      : "right-0 translate-x-1/2";

  return (
    <aside
      ref={panelRef}
      className={`relative flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden max-lg:w-full lg:min-h-0 ${className ?? ""} ${
        isResizing ? "select-none" : ""
      }`}
      style={panelStyle}
      data-resizable-side-panel=""
      data-edge={edge}
    >
      {isDesktop && !fillAvailableSpace ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          aria-valuemin={minWidth}
          aria-valuemax={ariaMaxWidth}
          aria-valuenow={width}
          onPointerDown={handlePointerDown}
          className={`absolute top-0 bottom-0 z-20 w-3 cursor-col-resize touch-none ${handlePositionClass}`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-3 bottom-3 left-1/2 w-[2px] -translate-x-1/2 rounded-full ${
              isResizing ? "bg-white/15" : "bg-transparent hover:bg-white/10"
            }`}
          />
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </aside>
  );
}
