import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "~/lib/utils";

import "./segmentedPillToggle.css";

export type SegmentedPillToggleOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly shortcut?: string;
};

type IndicatorStyle = {
  left: number;
  top: number;
  width: number;
  height: number;
  ready: boolean;
};

const INITIAL_INDICATOR: IndicatorStyle = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  ready: false,
};

/**
 * Sliding-pill segmented control — mirrors BacksterOS desktop
 * `SegmentedPillToggle` (edit/preview, list/board).
 */
export function SegmentedPillToggle<T extends string>(props: {
  readonly value: T;
  readonly options: readonly SegmentedPillToggleOption<T>[];
  readonly onChange: (value: T) => void;
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly className?: string;
}) {
  const { value, options, onChange, ariaLabel, disabled = false, className } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState<IndicatorStyle>(INITIAL_INDICATOR);
  const activeIndex = options.findIndex((option) => option.value === value);

  useLayoutEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, options.length);

    function updateIndicator() {
      const container = containerRef.current;
      const activeButton = activeIndex >= 0 ? buttonRefs.current[activeIndex] : null;

      if (!container || !activeButton) {
        setIndicator(INITIAL_INDICATOR);
        return;
      }

      if (activeButton.offsetParent === container) {
        setIndicator({
          left: activeButton.offsetLeft,
          top: activeButton.offsetTop,
          width: activeButton.offsetWidth,
          height: activeButton.offsetHeight,
          ready: true,
        });
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      setIndicator({
        left: buttonRect.left - containerRect.left,
        top: buttonRect.top - containerRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
        ready: true,
      });
    }

    updateIndicator();
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(updateIndicator);
    resizeObserver.observe(container);
    const activeButton = activeIndex >= 0 ? buttonRefs.current[activeIndex] : null;
    if (activeButton) resizeObserver.observe(activeButton);
    window.addEventListener("resize", updateIndicator);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [activeIndex, options, value]);

  const indicatorStyle: CSSProperties = {
    width: indicator.width,
    height: indicator.height,
    transform: `translate(${indicator.left}px, ${indicator.top}px)`,
    opacity: indicator.ready ? 1 : 0,
  };

  return (
    <div
      ref={containerRef}
      className={cn("bos-segmented-pill-toggle", disabled && "is-disabled", className)}
      role="group"
      aria-label={ariaLabel}
    >
      <span
        aria-hidden="true"
        className="bos-segmented-pill-toggle__indicator"
        style={indicatorStyle}
      />
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            className={cn("bos-segmented-pill-toggle-btn", active && "is-active")}
            aria-pressed={active}
            disabled={disabled}
            title={option.shortcut ? `${option.label} (${option.shortcut})` : option.label}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Bottom-right dock for Edit/Preview — desktop `FloatingPillToggleDock`. */
export function FloatingPillToggleDock(props: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("content-view-mode-toggle", props.className)}>
      <div className="content-view-mode-toggle__inner">{props.children}</div>
    </div>
  );
}
