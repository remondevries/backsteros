"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export type ListBoardView = "list" | "board";

export type SegmentedPillToggleOption<T extends string> = {
  value: T;
  label: string;
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
}: {
  value: T;
  options: readonly SegmentedPillToggleOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
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
    const activeButton =
      activeIndex >= 0 ? buttonRefs.current[activeIndex] : null;
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
      className={`segmented-pill-toggle${disabled ? " is-disabled" : ""}`}
      role="group"
      aria-label={ariaLabel}
    >
      <span
        aria-hidden="true"
        className="segmented-pill-toggle__indicator"
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
            className={`segmented-pill-toggle-btn${active ? " is-active" : ""}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export type ListBoardViewShellProps = {
  view: ListBoardView;
  onViewChange: (view: ListBoardView) => void;
  listContent: ReactNode;
  boardContent?: ReactNode;
  ariaLabel?: string;
};

export function ListBoardViewShell({
  view,
  onViewChange,
  listContent,
  boardContent,
  ariaLabel = "View mode",
}: ListBoardViewShellProps) {
  const isBoard = view === "board";

  return (
    <div
      className={`list-board-view-shell${isBoard ? " list-board-view-shell--board" : " list-board-view-shell--list"}`}
      data-list-board-view
    >
      {isBoard ? (
        <div className="list-board-view-board">
          {boardContent ?? (
            <p className="overview-empty">Board view will port next.</p>
          )}
        </div>
      ) : (
        <div className="list-board-view-list">{listContent}</div>
      )}

      <div className="content-view-mode-toggle">
        <SegmentedPillToggle
          value={view}
          options={[
            { value: "list", label: "List" },
            { value: "board", label: "Board" },
          ]}
          onChange={onViewChange}
          ariaLabel={ariaLabel}
        />
      </div>
    </div>
  );
}
