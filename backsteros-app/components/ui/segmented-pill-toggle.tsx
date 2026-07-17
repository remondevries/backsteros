"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type SegmentedPillToggleOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedPillToggleProps<T extends string> = {
  value: T;
  options: SegmentedPillToggleOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
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

export function SegmentedPillToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className,
}: SegmentedPillToggleProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState<IndicatorStyle>(INITIAL_INDICATOR);

  const activeIndex = options.findIndex((option) => option.value === value);

  useLayoutEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, options.length);

    function updateIndicator() {
      const container = containerRef.current;
      const activeButton =
        activeIndex >= 0 ? buttonRefs.current[activeIndex] : null;

      if (!container || !activeButton) {
        setIndicator(INITIAL_INDICATOR);
        return;
      }

      // offset* keeps the slide aligned with flex padding (more reliable than
      // getBoundingClientRect when backdrop-filter / transforms are involved).
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
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(updateIndicator);
    resizeObserver.observe(container);

    const activeButton =
      activeIndex >= 0 ? buttonRefs.current[activeIndex] : null;
    if (activeButton) {
      resizeObserver.observe(activeButton);
    }

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
      role="group"
      aria-label={ariaLabel}
      className={[
        "segmented-pill-toggle",
        "relative inline-flex items-center gap-0.5 rounded-full border-[0.5px] border-white/[0.09] bg-white/[0.04] p-0.5",
        disabled ? "pointer-events-none opacity-60" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 rounded-full border-[0.5px] border-white/[0.09] bg-white/[0.07] transition-[transform,width,height,opacity] duration-200 ease-out"
        style={indicatorStyle}
      />

      {options.map((option, index) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`relative z-[1] inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium leading-none transition-colors ${
              isActive
                ? "text-foreground"
                : "text-foreground/55 hover:text-foreground"
            }`}
            aria-pressed={isActive}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
