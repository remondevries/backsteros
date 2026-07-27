import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type StatusBarHoverItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  onSelect: () => void;
};

type Bounds = {
  bottom: number;
  right: number;
  width: number;
};

export function StatusBarHoverMenu({
  label,
  value,
  emptyHint,
  items,
  dot,
}: {
  label: string;
  value: ReactNode;
  emptyHint: string;
  items: StatusBarHoverItem[];
  dot?: ReactNode;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updateBounds = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setBounds({
      bottom: Math.round(window.innerHeight - rect.top + 6),
      right: Math.round(window.innerWidth - rect.right),
      width: Math.max(220, Math.round(rect.width)),
    });
  }, []);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimerRef.current = window.setTimeout(() => {
      updateBounds();
      setOpen(true);
    }, 120);
  }, [clearTimers, updateBounds]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 160);
  }, [clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useLayoutEffect(() => {
    if (!open) return;
    updateBounds();
    const onReposition = () => updateBounds();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateBounds]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const panel =
    open && bounds && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={menuId}
            className="statusbar-hover-panel"
            role="menu"
            style={{
              bottom: bounds.bottom,
              right: bounds.right,
              minWidth: bounds.width,
            }}
            onMouseEnter={() => {
              clearTimers();
              setOpen(true);
            }}
            onMouseLeave={scheduleClose}
          >
            {items.length === 0 ? (
              <p className="statusbar-hover-empty">{emptyHint}</p>
            ) : (
              <ul className="statusbar-hover-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="statusbar-hover-item"
                      role="menuitem"
                      onClick={() => {
                        item.onSelect();
                        setOpen(false);
                      }}
                    >
                      <span className="statusbar-hover-item-title">
                        {item.title}
                      </span>
                      {item.subtitle ? (
                        <span className="statusbar-hover-item-subtitle">
                          {item.subtitle}
                        </span>
                      ) : null}
                      {item.meta ? (
                        <span className="statusbar-hover-item-meta">
                          {item.meta}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <span
      ref={triggerRef}
      className={`statusbar-agents${open ? " is-open" : ""}`}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && panelRef.current?.contains(next)) return;
        scheduleClose();
      }}
    >
      <span className="statusbar-metric-label">{label}</span>
      <span className="statusbar-metric-value">{value}</span>
      {dot}
      {panel}
    </span>
  );
}
