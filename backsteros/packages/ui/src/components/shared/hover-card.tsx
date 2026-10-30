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
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

type HoverCardSide = "top" | "bottom";

type HoverCardContextValue = {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  contentId: string;
  close: () => void;
  openOnClick: boolean;
  onTriggerEnter: () => void;
  onTriggerLeave: () => void;
  onTriggerClick: (event: ReactMouseEvent<HTMLElement>) => void;
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

/** Dismiss the open hover card immediately (e.g. after navigating from a CTA). */
export function useHoverCardClose(): (() => void) | null {
  return useContext(HoverCardContext)?.close ?? null;
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
  /**
   * Primary click toggles a pinned open state (Escape / outside click dismiss).
   * Modifier / middle-clicks still follow links. Hover still works when unpinned.
   */
  openOnClick?: boolean;
};

export function HoverCard({
  children,
  openDelay = 150,
  closeDelay = 120,
  openOnClick = false,
}: HoverCardProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentId = useId();
  const pinnedRef = useRef(false);
  pinnedRef.current = pinned;

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

  const close = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setPinned(false);
    setOpen(false);
  }, [clearCloseTimer, clearOpenTimer]);

  const scheduleOpen = useCallback(() => {
    clearCloseTimer();
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => {
      setOpen(true);
    }, openDelay);
  }, [clearCloseTimer, clearOpenTimer, openDelay]);

  const scheduleClose = useCallback(() => {
    if (pinnedRef.current) return;
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, closeDelay);
  }, [clearCloseTimer, clearOpenTimer, closeDelay]);

  const onTriggerClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!openOnClick) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      clearOpenTimer();
      clearCloseTimer();
      setPinned((wasPinned) => {
        if (wasPinned) {
          setOpen(false);
          return false;
        }
        setOpen(true);
        return true;
      });
    },
    [clearCloseTimer, clearOpenTimer, openOnClick],
  );

  useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [clearCloseTimer, clearOpenTimer]);

  useEffect(() => {
    if (!openOnClick || !pinned || !open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (contentRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [close, open, openOnClick, pinned]);

  const value: HoverCardContextValue = {
    open,
    triggerRef,
    contentRef,
    contentId,
    close,
    openOnClick,
    onTriggerEnter: scheduleOpen,
    onTriggerLeave: scheduleClose,
    onTriggerClick,
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
  const {
    triggerRef,
    contentId,
    open,
    onTriggerEnter,
    onTriggerLeave,
    onTriggerClick,
    openOnClick,
  } = useHoverCardContext();
  const triggerClassName = className ?? "bos-hover-card-trigger";

  const focusHandlers = {
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }
      onTriggerEnter();
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }
      onTriggerLeave();
    },
  };

  if (!asChild) {
    return (
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-describedby={open ? contentId : undefined}
        aria-expanded={openOnClick ? open : undefined}
        onMouseEnter={onTriggerEnter}
        onMouseLeave={onTriggerLeave}
        onClick={onTriggerClick}
        onFocus={focusHandlers.onFocus}
        onBlur={focusHandlers.onBlur}
        className={triggerClassName}
      >
        {children}
      </span>
    );
  }

  const childElement = children as ReactElement<{
    className?: string;
    onMouseEnter?: (event: ReactMouseEvent<HTMLElement>) => void;
    onMouseLeave?: (event: ReactMouseEvent<HTMLElement>) => void;
    onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
    onFocus?: (event: FocusEvent<HTMLElement>) => void;
    onBlur?: (event: FocusEvent<HTMLElement>) => void;
    ref?: Ref<HTMLElement>;
    tabIndex?: number;
    "aria-describedby"?: string;
    "aria-expanded"?: boolean;
  }>;

  return (
    <HoverCardAsChildTrigger
      child={childElement}
      className={className}
      triggerRef={triggerRef}
      contentId={contentId}
      open={open}
      openOnClick={openOnClick}
      onTriggerEnter={onTriggerEnter}
      onTriggerLeave={onTriggerLeave}
      onTriggerClick={onTriggerClick}
    />
  );
}

type HoverCardAsChildTriggerProps = {
  child: ReactElement<{
    className?: string;
    onMouseEnter?: (event: ReactMouseEvent<HTMLElement>) => void;
    onMouseLeave?: (event: ReactMouseEvent<HTMLElement>) => void;
    onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
    onFocus?: (event: FocusEvent<HTMLElement>) => void;
    onBlur?: (event: FocusEvent<HTMLElement>) => void;
    ref?: Ref<HTMLElement>;
    tabIndex?: number;
    "aria-describedby"?: string;
    "aria-expanded"?: boolean;
  }>;
  className?: string;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentId: string;
  open: boolean;
  openOnClick: boolean;
  onTriggerEnter: () => void;
  onTriggerLeave: () => void;
  onTriggerClick: (event: ReactMouseEvent<HTMLElement>) => void;
};

function HoverCardAsChildTrigger({
  child,
  className,
  triggerRef,
  contentId,
  open,
  openOnClick,
  onTriggerEnter,
  onTriggerLeave,
  onTriggerClick,
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
    tabIndex: child.props.tabIndex ?? 0,
    "aria-describedby": open ? contentId : undefined,
    "aria-expanded": openOnClick ? open : undefined,
    onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => {
      child.props.onMouseEnter?.(event);
      onTriggerEnter();
    },
    onMouseLeave: (event: ReactMouseEvent<HTMLElement>) => {
      child.props.onMouseLeave?.(event);
      onTriggerLeave();
    },
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
      onTriggerClick(event);
      if (event.defaultPrevented) return;
      child.props.onClick?.(event);
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      child.props.onFocus?.(event);
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }
      onTriggerEnter();
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      child.props.onBlur?.(event);
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }
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
    contentRef,
    contentId,
    openOnClick,
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
    // Prefer CSS width on the panel (e.g. contact peek at 22.5rem); only fall
    // back to 320 when the class does not define one.
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
        minWidth: width,
        visibility: "visible",
      });
      return;
    }

    setStyle({
      position: "fixed",
      left,
      bottom: window.innerHeight - rect.top + sideOffset,
      minWidth: width,
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
      ref={contentRef}
      id={contentId}
      role={openOnClick ? "dialog" : "tooltip"}
      onMouseEnter={onContentEnter}
      onMouseLeave={onContentLeave}
      className={className ?? "bos-hover-card"}
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}
