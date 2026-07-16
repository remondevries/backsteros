"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const clamp = (value: number) => Math.min(420, Math.max(210, value));

export function ResizablePanel({
  children,
  storageKey,
}: {
  children: ReactNode;
  storageKey: string;
}) {
  const [width, setWidth] = useState(244);
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
    [storageKey],
  );

  return (
    <aside className="context-panel" style={{ width }}>
      {children}
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
    </aside>
  );
}
