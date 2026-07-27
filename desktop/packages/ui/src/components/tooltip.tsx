"use client";

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactElement,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

export type TooltipSide = "top" | "bottom";

export type TooltipProps = {
  label: string;
  children: ReactElement;
  side?: TooltipSide;
  /** Delay before showing (ms). */
  openDelay?: number;
  /** When true, force the tooltip closed (e.g. while a dropdown is open). */
  disabled?: boolean;
  className?: string;
};

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") {
        ref(node);
      } else {
        ref.current = node;
      }
    }
  };
}

/**
 * Lightweight owned tooltip — portals a short label above/below the trigger.
 * Prefer this over native `title` for list-row chrome we style ourselves.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  openDelay = 350,
  disabled = false,
  className,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentId = useId();
  const trimmed = label.trim();

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    if (disabled || !trimmed) return;
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => {
      setOpen(true);
    }, openDelay);
  }, [clearOpenTimer, disabled, openDelay, trimmed]);

  const close = useCallback(() => {
    clearOpenTimer();
    setOpen(false);
  }, [clearOpenTimer]);

  useEffect(() => {
    if (disabled) {
      close();
    }
  }, [close, disabled]);

  useEffect(() => {
    return () => {
      clearOpenTimer();
    };
  }, [clearOpenTimer]);

  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 6;
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2),
        window.innerWidth - 8,
      );
      if (side === "bottom") {
        setStyle({
          position: "fixed",
          left,
          top: rect.bottom + gap,
          transform: "translateX(-50%)",
          visibility: "visible",
        });
      } else {
        setStyle({
          position: "fixed",
          left,
          top: rect.top - gap,
          transform: "translate(-50%, -100%)",
          visibility: "visible",
        });
      }
    };

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, side]);

  const child = children as ReactElement<{
    className?: string;
    onMouseEnter?: (event: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (event: React.MouseEvent<HTMLElement>) => void;
    onFocus?: (event: FocusEvent<HTMLElement>) => void;
    onBlur?: (event: FocusEvent<HTMLElement>) => void;
    onMouseDown?: (event: React.MouseEvent<HTMLElement>) => void;
    ref?: Ref<HTMLElement>;
    "aria-describedby"?: string;
  }>;

  const show = open && !disabled && Boolean(trimmed);

  const trigger = cloneElement(child, {
    ref: mergeRefs(child.props.ref, triggerRef),
    "aria-describedby": show ? contentId : child.props["aria-describedby"],
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      child.props.onMouseEnter?.(event);
      scheduleOpen();
    },
    onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
      child.props.onMouseLeave?.(event);
      close();
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      child.props.onFocus?.(event);
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }
      scheduleOpen();
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      child.props.onBlur?.(event);
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }
      close();
    },
    onMouseDown: (event: React.MouseEvent<HTMLElement>) => {
      child.props.onMouseDown?.(event);
      close();
    },
  });

  return (
    <>
      {trigger}
      {show && typeof document !== "undefined"
        ? createPortal(
            <span
              id={contentId}
              role="tooltip"
              className={["ui-tooltip", className].filter(Boolean).join(" ")}
              style={style}
            >
              {trimmed}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
