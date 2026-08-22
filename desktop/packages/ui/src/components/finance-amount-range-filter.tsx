"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@primer/octicons-react";

import {
  buildAmountHistogramBins,
  computeAmountRangeDomain,
  isFullAmountRange,
  type AmountRangeDomain,
} from "../finance/filter-finance-transactions.js";
import { TASK_PROPERTY_DROPDOWN_ATTRIBUTE } from "../tasks/task-property-dropdown-keys.js";

const PANEL_WIDTH = 320;
const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;
const BIN_COUNT = 41;
const TRIGGER_CLASSNAME =
  "property-dropdown-trigger--compose finance-filter-bar__dropdown-trigger";

export type FinanceAmountRangeFilterProps = {
  /** Inclusive lower bound; `null` = full domain min. */
  amountMinCents: number | null;
  /** Inclusive upper bound; `null` = full domain max. */
  amountMaxCents: number | null;
  onAmountRangeChange: (
    minCents: number | null,
    maxCents: number | null,
  ) => void;
  /** Amounts from the list *before* the amount filter (for histogram + domain). */
  amountCentsSamples: readonly number[];
  className?: string;
  panelAlign?: "start" | "end";
};

function formatEuroCompact(cents: number): string {
  const abs = Math.abs(cents);
  const maxFractionDigits = abs >= 10_000 ? 0 : 2;
  const minFractionDigits = Math.min(
    maxFractionDigits,
    abs % 100 === 0 ? 0 : 2,
  );
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: minFractionDigits,
  }).format(cents / 100);
}

function formatEuroInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (frac === 0) return `${sign}€${grouped}`;
  return `${sign}€${grouped},${String(frac).padStart(2, "0")}`;
}

function parseEuroInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = /^[-−]/.test(trimmed);
  const body = trimmed
    .replace(/^[-−]\s*/, "")
    .replace(/^€\s*/u, "")
    .replace(/\s*€$/u, "")
    .replace(/^EUR\s*/i, "")
    .trim();
  const cleaned = body.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  let integerPart: string;
  let fractionPart: string;
  const commaIdx = cleaned.lastIndexOf(",");
  if (commaIdx >= 0) {
    integerPart = cleaned.slice(0, commaIdx).replace(/\D/g, "");
    fractionPart = cleaned
      .slice(commaIdx + 1)
      .replace(/\D/g, "")
      .slice(0, 2);
  } else {
    const parts = cleaned.split(".");
    if (parts.length === 2 && parts[1]!.length > 0 && parts[1]!.length <= 2) {
      integerPart = parts[0]!.replace(/\D/g, "");
      fractionPart = parts[1]!.replace(/\D/g, "");
    } else {
      integerPart = cleaned.replace(/\D/g, "");
      fractionPart = "";
    }
  }

  if (!integerPart && !fractionPart) return null;
  const euros = Number.parseInt(integerPart || "0", 10);
  const frac = Number.parseInt(fractionPart.padEnd(2, "0") || "0", 10);
  if (!Number.isFinite(euros) || !Number.isFinite(frac)) return null;
  const cents = euros * 100 + frac;
  return negative ? -cents : cents;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveRange(
  minCents: number | null,
  maxCents: number | null,
  domain: AmountRangeDomain,
): { min: number; max: number } {
  let min = minCents ?? domain.minCents;
  let max = maxCents ?? domain.maxCents;
  min = clamp(min, domain.minCents, domain.maxCents);
  max = clamp(max, domain.minCents, domain.maxCents);
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

function emitRange(
  min: number,
  max: number,
  domain: AmountRangeDomain,
  onChange: (minCents: number | null, maxCents: number | null) => void,
) {
  if (isFullAmountRange(min, max, domain)) {
    onChange(null, null);
    return;
  }
  onChange(min, max);
}

/**
 * Amount filter dropdown: 0-centered histogram + dual-thumb range slider.
 */
export function FinanceAmountRangeFilter({
  amountMinCents,
  amountMaxCents,
  onAmountRangeChange,
  amountCentsSamples,
  className,
  panelAlign = "end",
}: FinanceAmountRangeFilterProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);
  const [minDraft, setMinDraft] = useState("");
  const [maxDraft, setMaxDraft] = useState("");

  const domain = useMemo(
    () => computeAmountRangeDomain(amountCentsSamples),
    [amountCentsSamples],
  );

  const range = useMemo(
    () => resolveRange(amountMinCents, amountMaxCents, domain),
    [amountMaxCents, amountMinCents, domain],
  );

  const active = !isFullAmountRange(amountMinCents, amountMaxCents, domain);

  const bins = useMemo(
    () => buildAmountHistogramBins(amountCentsSamples, domain, BIN_COUNT),
    [amountCentsSamples, domain],
  );

  const peakCount = useMemo(
    () => Math.max(1, ...bins.map((bin) => bin.count)),
    [bins],
  );

  const triggerLabel = active
    ? `${formatEuroCompact(range.min)} – ${formatEuroCompact(range.max)}`
    : "Amount";

  const minToneCents = parseEuroInput(minDraft) ?? range.min;
  const maxToneCents = parseEuroInput(maxDraft) ?? range.max;

  useEffect(() => {
    if (!open) return;
    setMinDraft(formatEuroInput(range.min));
    setMaxDraft(formatEuroInput(range.max));
  }, [open, range.max, range.min]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const trigger =
      anchor.querySelector("button") ??
      (anchor instanceof HTMLButtonElement ? anchor : null) ??
      anchor;
    const rect = trigger.getBoundingClientRect();
    const width = PANEL_WIDTH;
    const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
    let left = panelAlign === "end" ? rect.right - width : rect.left;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

    const panelHeight = panelRef.current?.offsetHeight ?? 280;
    const spaceBelow =
      window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight && rect.top > panelHeight + PANEL_GAP;
    const top = openUpward
      ? Math.max(VIEWPORT_PADDING, rect.top - panelHeight - PANEL_GAP)
      : rect.bottom + PANEL_GAP;

    setPanelStyle({
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      zIndex: 80,
      visibility: "visible",
    });
  }, [panelAlign]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(frame);
  }, [open, updatePosition, range.min, range.max, bins.length]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }

    function handleReposition() {
      updatePosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updatePosition]);

  const centsFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return range.min;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return range.min;
      const t = clamp((clientX - rect.left) / rect.width, 0, 1);
      const span = domain.maxCents - domain.minCents;
      return Math.round(domain.minCents + t * span);
    },
    [domain.maxCents, domain.minCents, range.min],
  );

  const onThumbPointerDown = (
    which: "min" | "max",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(which);
  };

  const onThumbPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    const next = centsFromClientX(event.clientX);
    if (dragging === "min") {
      const min = clamp(next, domain.minCents, range.max);
      emitRange(min, range.max, domain, onAmountRangeChange);
    } else {
      const max = clamp(next, range.min, domain.maxCents);
      emitRange(range.min, max, domain, onAmountRangeChange);
    }
  };

  const onThumbPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    setDragging(null);
  };

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const next = centsFromClientX(event.clientX);
    const distMin = Math.abs(next - range.min);
    const distMax = Math.abs(next - range.max);
    if (distMin <= distMax) {
      const min = clamp(next, domain.minCents, range.max);
      emitRange(min, range.max, domain, onAmountRangeChange);
      setDragging("min");
    } else {
      const max = clamp(next, range.min, domain.maxCents);
      emitRange(range.min, max, domain, onAmountRangeChange);
      setDragging("max");
    }
  };

  const commitMinDraft = () => {
    const parsed = parseEuroInput(minDraft);
    if (parsed == null) {
      setMinDraft(formatEuroInput(range.min));
      return;
    }
    const min = clamp(parsed, domain.minCents, range.max);
    emitRange(min, range.max, domain, onAmountRangeChange);
    setMinDraft(formatEuroInput(min));
  };

  const commitMaxDraft = () => {
    const parsed = parseEuroInput(maxDraft);
    if (parsed == null) {
      setMaxDraft(formatEuroInput(range.max));
      return;
    }
    const max = clamp(parsed, range.min, domain.maxCents);
    emitRange(range.min, max, domain, onAmountRangeChange);
    setMaxDraft(formatEuroInput(max));
  };

  const pct = (cents: number) => {
    const span = domain.maxCents - domain.minCents;
    if (span <= 0) return 0;
    return ((cents - domain.minCents) / span) * 100;
  };

  const minPct = pct(range.min);
  const maxPct = pct(range.max);

  return (
    <div
      ref={anchorRef}
      className={["finance-amount-range-filter", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          "searchable-dropdown-trigger-cluster",
          active ? "has-clear" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className={[
            "property-dropdown-trigger",
            TRIGGER_CLASSNAME,
            active ? "is-filled has-clear" : "is-empty",
            open ? "is-open" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Filter by amount"
          {...{ [TASK_PROPERTY_DROPDOWN_ATTRIBUTE]: "amount" }}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="property-dropdown-trigger__label">
            {active ? (
              <>
                <span
                  className={
                    range.min < 0
                      ? "is-debit"
                      : range.min > 0
                        ? "is-credit"
                        : undefined
                  }
                >
                  {formatEuroCompact(range.min)}
                </span>
                <span className="finance-amount-range-filter__sep"> – </span>
                <span
                  className={
                    range.max < 0
                      ? "is-debit"
                      : range.max > 0
                        ? "is-credit"
                        : undefined
                  }
                >
                  {formatEuroCompact(range.max)}
                </span>
              </>
            ) : (
              triggerLabel
            )}
          </span>
        </button>
        {active ? (
          <button
            type="button"
            className="property-dropdown-trigger__clear"
            aria-label="Clear amount filter"
            onClick={(event) => {
              event.stopPropagation();
              onAmountRangeChange(null, null);
              setOpen(false);
            }}
          >
            <XIcon size={12} />
          </button>
        ) : null}
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="finance-amount-range-panel searchable-dropdown-panel"
              style={panelStyle}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="finance-amount-range-panel__header">
                <h3
                  className="finance-amount-range-panel__title"
                  id={titleId}
                >
                  Amount range
                </h3>
                <p className="finance-amount-range-panel__subtitle">
                  Debit left, credit right — 0 in the middle
                </p>
              </div>

              <div className="finance-amount-range-panel__chart">
                <div
                  className="finance-amount-range-panel__histogram"
                  aria-hidden="true"
                >
                  {bins.map((bin, index) => {
                    const mid = (bin.startCents + bin.endCents) / 2;
                    const inRange = mid >= range.min && mid <= range.max;
                    const heightPct = (bin.count / peakCount) * 100;
                    return (
                      <span
                        key={`${bin.startCents}-${index}`}
                        className={[
                          "finance-amount-range-panel__bar",
                          inRange ? "is-active" : "is-muted",
                        ].join(" ")}
                        style={{ height: `${Math.max(heightPct, bin.count > 0 ? 6 : 2)}%` }}
                      />
                    );
                  })}
                </div>

                <div
                  ref={trackRef}
                  className="finance-amount-range-panel__track"
                  onPointerDown={onTrackPointerDown}
                >
                  <span className="finance-amount-range-panel__track-rail" />
                  <span
                    className="finance-amount-range-panel__track-fill"
                    style={{
                      left: `${minPct}%`,
                      width: `${Math.max(0, maxPct - minPct)}%`,
                    }}
                  />
                  <span
                    className="finance-amount-range-panel__zero"
                    style={{ left: `${pct(0)}%` }}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    className="finance-amount-range-panel__thumb"
                    style={{ left: `${minPct}%` }}
                    aria-label="Minimum amount"
                    onPointerDown={(event) => onThumbPointerDown("min", event)}
                    onPointerMove={onThumbPointerMove}
                    onPointerUp={onThumbPointerUp}
                    onPointerCancel={onThumbPointerUp}
                  />
                  <button
                    type="button"
                    className="finance-amount-range-panel__thumb"
                    style={{ left: `${maxPct}%` }}
                    aria-label="Maximum amount"
                    onPointerDown={(event) => onThumbPointerDown("max", event)}
                    onPointerMove={onThumbPointerMove}
                    onPointerUp={onThumbPointerUp}
                    onPointerCancel={onThumbPointerUp}
                  />
                </div>
              </div>

              <div className="finance-amount-range-panel__inputs">
                <label className="finance-amount-range-panel__field">
                  <span className="finance-amount-range-panel__field-label">
                    Minimum
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={[
                      "finance-amount-range-panel__field-input",
                      minToneCents < 0
                        ? "is-debit"
                        : minToneCents > 0
                          ? "is-credit"
                          : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    value={minDraft}
                    onChange={(event) => setMinDraft(event.target.value)}
                    onBlur={commitMinDraft}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitMinDraft();
                      }
                    }}
                  />
                </label>
                <label className="finance-amount-range-panel__field finance-amount-range-panel__field--end">
                  <span className="finance-amount-range-panel__field-label">
                    Maximum
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={[
                      "finance-amount-range-panel__field-input",
                      maxToneCents < 0
                        ? "is-debit"
                        : maxToneCents > 0
                          ? "is-credit"
                          : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    value={maxDraft}
                    onChange={(event) => setMaxDraft(event.target.value)}
                    onBlur={commitMaxDraft}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitMaxDraft();
                      }
                    }}
                  />
                </label>
              </div>

              {active ? (
                <button
                  type="button"
                  className="finance-amount-range-panel__reset"
                  onClick={() => onAmountRangeChange(null, null)}
                >
                  Reset range
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
