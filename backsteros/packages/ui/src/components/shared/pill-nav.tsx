"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type PillNavItem<T extends string> = {
  value: T;
  label: string;
  /** Optional count shown in a small circle beside the label. */
  count?: number | string | null;
};

export type PillNavProps<T extends string> = {
  items: readonly PillNavItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  /**
   * Shared underline that animates between tabs (chrome header tabs).
   * Active item text still uses `.is-active`; the bar is a separate element.
   */
  slidingIndicator?: boolean;
};

type IndicatorBox = {
  left: number;
  width: number;
  ready: boolean;
};

export function PillNav<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = "",
  slidingIndicator = false,
}: PillNavProps<T>) {
  const navRef = useRef<HTMLElement | null>(null);
  const [indicator, setIndicator] = useState<IndicatorBox>({
    left: 0,
    width: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    if (!slidingIndicator) return;

    const nav = navRef.current;
    if (!nav) return;

    const update = () => {
      const active = nav.querySelector<HTMLElement>(
        ".app-pill-nav-item.is-active",
      );
      if (!active) {
        setIndicator((current) =>
          current.width === 0 && !current.ready
            ? current
            : { left: 0, width: 0, ready: false },
        );
        return;
      }
      const left = active.offsetLeft;
      const width = active.offsetWidth;
      setIndicator((current) =>
        current.left === left &&
        current.width === width &&
        current.ready
          ? current
          : { left, width, ready: true },
      );
    };

    update();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => update())
        : null;
    resizeObserver?.observe(nav);
    for (const button of nav.querySelectorAll(".app-pill-nav-item")) {
      resizeObserver?.observe(button);
    }

    window.addEventListener("resize", update);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [items, slidingIndicator, value]);

  return (
    <nav
      ref={navRef}
      className={[
        "app-pill-nav",
        slidingIndicator ? "app-pill-nav--sliding" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={ariaLabel}
    >
      {slidingIndicator ? (
        <span
          className={[
            "app-pill-nav__indicator",
            indicator.ready ? "is-ready" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
          style={{
            transform: `translateX(${indicator.left}px)`,
            width: indicator.width,
          }}
        />
      ) : null}
      {items.map((item) => {
        const isActive = item.value === value;
        const count =
          item.count === null || item.count === undefined
            ? null
            : String(item.count);
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            data-pill-nav-value={item.value}
            className={`app-pill-nav-item${isActive ? " is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="app-pill-nav-item-label">{item.label}</span>
            {count != null ? (
              <span className="app-pill-nav-item-count">{count}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
