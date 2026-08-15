"use client";

import {
  BarItem,
  type BarCustomLayerProps,
  type BarDatum,
  type BarItemProps,
  type ComputedDatum,
} from "@nivo/bar";
import type { MouseEvent } from "react";

const SELECTED_OPACITY = 1;
/** Strong mute so tall non-selected bars don’t compete with the active month. */
const OTHER_OPACITY = 0.18;
const FUTURE_OPACITY = 0.08;

function readFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function cashflowBarOpacity(data: BarDatum): number {
  if (readFlag(data.isFutureMonth)) return FUTURE_OPACITY;
  if (readFlag(data.isCurrentMonth)) return SELECTED_OPACITY;
  return OTHER_OPACITY;
}

export function cashflowMonthFromBarDatum(
  datum: ComputedDatum<BarDatum> & { color?: string },
): string | null {
  const month = String(datum.indexValue ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  if (readFlag(datum.data.isFutureMonth)) return null;
  return month;
}

function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

/**
 * Soft vertical band behind the selected month so selection is obvious
 * even when neighbouring bars are taller.
 */
export function CashflowSelectedMonthBand({
  bars,
  innerHeight,
}: BarCustomLayerProps<BarDatum>) {
  const selected = bars.filter((bar) =>
    readFlag(bar.data.data.isCurrentMonth),
  );
  if (selected.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const bar of selected) {
    minX = Math.min(minX, bar.x);
    maxX = Math.max(maxX, bar.x + bar.width);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX) {
    return null;
  }

  const pad = 4;
  const foreground = readCssColor("--foreground", "#fff");
  return (
    <rect
      x={minX - pad}
      y={0}
      width={maxX - minX + pad * 2}
      height={innerHeight}
      rx={6}
      fill={foreground}
      opacity={0.07}
      pointerEvents="none"
    />
  );
}

/**
 * Bar that dims non-selected months so the active month reads clearly,
 * and supports click-to-select without a floating label badge.
 */
export function SelectableCashflowBar(props: BarItemProps<BarDatum>) {
  const opacity = cashflowBarOpacity(props.bar.data.data);
  const future = readFlag(props.bar.data.data.isFutureMonth);
  return (
    <g
      opacity={opacity}
      style={{ cursor: future ? "default" : "pointer" }}
    >
      <BarItem {...props} />
    </g>
  );
}

export function handleCashflowBarMonthClick(
  datum: ComputedDatum<BarDatum> & {
    color: string;
  },
  event: MouseEvent,
  onMonthSelect?: (month: string) => void,
): void {
  event.stopPropagation();
  const month = cashflowMonthFromBarDatum(datum);
  if (!month || !onMonthSelect) return;
  onMonthSelect(month);
}
