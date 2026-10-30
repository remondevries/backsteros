"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { SIDEBAR_COLLAPSE_DURATION_MS } from "./content-layout-transition-context.js";

const CHAT_PANEL_WIDTH_MIN = 280;
const CHAT_PANEL_WIDTH_MAX = 560;
const CHAT_PANEL_WIDTH_DEFAULT = 360;
export const CHAT_PANEL_WIDTH_STORAGE_KEY = "backsteros:chat-panel-width";
export const CHAT_PANEL_VISIBLE_STORAGE_KEY = "backsteros:chat-panel-visible";
export const CHAT_PANEL_COLLAPSE_DURATION_MS = SIDEBAR_COLLAPSE_DURATION_MS;

function clampWidth(value: number): number {
  return Math.min(CHAT_PANEL_WIDTH_MAX, Math.max(CHAT_PANEL_WIDTH_MIN, value));
}

export type ProductChatPanelProps = {
  children: ReactNode;
  collapsed?: boolean;
  animating?: boolean;
  /** Controlled width from the shell (persisted). */
  width?: number;
  onWidthChange?: (width: number) => void;
};

/**
 * Frameless right chat column — mirrors the left nav (window background, no
 * card chrome). Resizable from the left edge; collapse animates width to 0.
 */
export function ProductChatPanel({
  children,
  collapsed = false,
  animating = false,
  width: controlledWidth,
  onWidthChange,
}: ProductChatPanelProps) {
  const [width, setWidth] = useState(controlledWidth ?? CHAT_PANEL_WIDTH_DEFAULT);
  const widthRef = useRef(width);

  useEffect(() => {
    if (controlledWidth != null && Number.isFinite(controlledWidth)) {
      const next = clampWidth(controlledWidth);
      setWidth(next);
      widthRef.current = next;
    }
  }, [controlledWidth]);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (collapsed) return;
      event.preventDefault();
      const handle = event.currentTarget;
      const origin = event.clientX;
      const initial = widthRef.current;
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("is-resizing");

      const move = (next: PointerEvent) => {
        // Drag left → wider panel (handle is on the left edge).
        const nextWidth = clampWidth(initial + (origin - next.clientX));
        widthRef.current = nextWidth;
        setWidth(nextWidth);
        onWidthChange?.(nextWidth);
      };
      const finish = () => {
        localStorage.setItem(
          CHAT_PANEL_WIDTH_STORAGE_KEY,
          String(widthRef.current),
        );
        document.body.classList.remove("is-resizing");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    },
    [collapsed, onWidthChange],
  );

  return (
    <aside
      className={`desktop-chat-panel${collapsed ? " is-collapsed" : ""}${
        animating ? " is-animating" : ""
      }`}
      style={{
        width: collapsed ? 0 : width,
        minWidth: collapsed ? 0 : width,
      }}
      aria-hidden={collapsed || undefined}
      data-chat-panel-collapsed={collapsed ? "true" : "false"}
      {...(collapsed ? { inert: true } : {})}
    >
      {collapsed ? null : (
        <div
          className="desktop-chat-panel__resize"
          role="separator"
          aria-label="Resize chat panel"
          aria-orientation="vertical"
          aria-valuemin={CHAT_PANEL_WIDTH_MIN}
          aria-valuemax={CHAT_PANEL_WIDTH_MAX}
          aria-valuenow={width}
          onPointerDown={startResize}
        />
      )}
      <div
        className="desktop-chat-panel__body"
        style={{ width, minWidth: width, maxWidth: width }}
      >
        {children}
      </div>
    </aside>
  );
}

export function readStoredChatPanelWidth(): number {
  if (typeof window === "undefined") return CHAT_PANEL_WIDTH_DEFAULT;
  const stored = Number(localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(stored) || stored <= 0) return CHAT_PANEL_WIDTH_DEFAULT;
  return clampWidth(stored);
}

export function readStoredChatPanelCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(CHAT_PANEL_VISIBLE_STORAGE_KEY);
  if (stored === null) return false;
  return stored === "false";
}
