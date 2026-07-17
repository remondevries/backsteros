"use client";

import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

type HoverCardSide = "top" | "bottom";

type HoverCardContextValue = {
  open: boolean;
  openDelay: number;
  closeDelay: number;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentId: string;
  onTriggerEnter: () => void;
  onTriggerLeave: () => void;
  onContentEnter: () => void;
  onContentLeave: () => void;
};

const HoverCardContext = createContext<HoverCardContextValue | null>(null);

function useHoverCardContext() {
  const context = useContext(HoverCardContext);
  if (!context) {
    throw new Error("HoverCard components must be used within HoverCard");
  }
  return context;
}

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

type HoverCardProps = {
  children: ReactNode;
  openDelay?: number;
  closeDelay?: number;
};

export function HoverCard({
  children,
  openDelay = 150,
  closeDelay = 120,
}: HoverCardProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentId = useId();

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearCloseTimer();
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => {
      setOpen(true);
    }, openDelay);
  }, [clearCloseTimer, clearOpenTimer, openDelay]);

  const scheduleClose = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, closeDelay);
  }, [clearCloseTimer, clearOpenTimer, closeDelay]);

  useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [clearCloseTimer, clearOpenTimer]);

  const value: HoverCardContextValue = {
    open,
    openDelay,
    closeDelay,
    triggerRef,
    contentId,
    onTriggerEnter: scheduleOpen,
    onTriggerLeave: scheduleClose,
    onContentEnter: () => {
      clearCloseTimer();
      setOpen(true);
    },
    onContentLeave: scheduleClose,
  };

  return (
    <HoverCardContext.Provider value={value}>{children}</HoverCardContext.Provider>
  );
}

type HoverCardTriggerProps = {
  children: ReactNode;
  asChild?: boolean;
  className?: string;
};

export function HoverCardTrigger({
  children,
  asChild = false,
  className,
}: HoverCardTriggerProps) {
  const { triggerRef, onTriggerEnter, onTriggerLeave } = useHoverCardContext();
  const triggerClassName = className ?? "inline align-baseline";

  const childElement = asChild
    ? (children as ReactElement<{
        className?: string;
        onMouseEnter?: (event: React.MouseEvent<HTMLElement>) => void;
        onMouseLeave?: (event: React.MouseEvent<HTMLElement>) => void;
        ref?: Ref<HTMLElement>;
      }>)
    : null;

  if (!asChild) {
    return (
      <span
        ref={triggerRef}
        onMouseEnter={onTriggerEnter}
        onMouseLeave={onTriggerLeave}
        className={triggerClassName}
      >
        {children}
      </span>
    );
  }

  return (
    <HoverCardAsChildTrigger
      child={childElement!}
      className={className}
      triggerRef={triggerRef}
      onTriggerEnter={onTriggerEnter}
      onTriggerLeave={onTriggerLeave}
    />
  );
}

type HoverCardAsChildTriggerProps = {
  child: ReactElement<{
    className?: string;
    onMouseEnter?: (event: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (event: React.MouseEvent<HTMLElement>) => void;
    ref?: Ref<HTMLElement>;
  }>;
  className?: string;
  triggerRef: React.RefObject<HTMLElement | null>;
  onTriggerEnter: () => void;
  onTriggerLeave: () => void;
};

function HoverCardAsChildTrigger({
  child,
  className,
  triggerRef,
  onTriggerEnter,
  onTriggerLeave,
}: HoverCardAsChildTriggerProps) {
  const mergedClassName = [child.props.className, className]
    .filter(Boolean)
    .join(" ");

  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      mergeRefs(child.props.ref, triggerRef)(node);
    },
    [child, triggerRef],
  );

  return cloneElement(child, {
    className: mergedClassName || undefined,
    ref: mergedRef,
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      child.props.onMouseEnter?.(event);
      onTriggerEnter();
    },
    onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
      child.props.onMouseLeave?.(event);
      onTriggerLeave();
    },
  });
}

type HoverCardContentProps = {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: HoverCardSide;
  sideOffset?: number;
};

export function HoverCardContent({
  children,
  className,
  align = "start",
  side = "top",
  sideOffset = 6,
}: HoverCardContentProps) {
  const {
    open,
    triggerRef,
    contentId,
    onContentEnter,
    onContentLeave,
  } = useHoverCardContext();
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      setStyle((current) => ({
        ...current,
        visibility: "hidden",
      }));
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const width = 320;
    const leftBase =
      align === "end"
        ? rect.right - width
        : align === "center"
          ? rect.left + rect.width / 2 - width / 2
          : rect.left;
    const left = Math.max(
      8,
      Math.min(leftBase, window.innerWidth - width - 8),
    );

    if (side === "bottom") {
      setStyle({
        position: "fixed",
        left,
        top: rect.bottom + sideOffset,
        width,
        visibility: "visible",
      });
      return;
    }

    setStyle({
      position: "fixed",
      left,
      bottom: window.innerHeight - rect.top + sideOffset,
      width,
      visibility: "visible",
    });
  }, [align, side, sideOffset, triggerRef]);

  useEffect(() => {
    if (!open) {
      return;
    }

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [measure, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      id={contentId}
      role="tooltip"
      onMouseEnter={onContentEnter}
      onMouseLeave={onContentLeave}
      className={
        className ??
        "z-50 rounded-lg border border-white/10 bg-background text-foreground shadow-lg"
      }
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}
