"use client";

import type { ReactNode } from "react";

export type FinanceChartLoadingProps = {
  label?: string;
  className?: string;
};

/** Pulsing loading label — no placeholder background or border. */
export function FinanceChartLoading({
  label = "Loading chart…",
  className,
}: FinanceChartLoadingProps) {
  return (
    <div
      className={["finance-chart-loading", className].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className="finance-chart-loading__text">{label}</span>
    </div>
  );
}

export type FinanceChartEmptyProps = {
  children: ReactNode;
  className?: string;
};

/** Empty chart message — no placeholder chrome. */
export function FinanceChartEmpty({
  children,
  className,
}: FinanceChartEmptyProps) {
  return (
    <div
      className={["finance-chart-empty", className].filter(Boolean).join(" ")}
      role="status"
    >
      {children}
    </div>
  );
}

export type FinanceChartFadeInProps = {
  children: ReactNode;
  className?: string;
};

/** Fade-in wrapper for chart content after loading completes. */
export function FinanceChartFadeIn({
  children,
  className,
}: FinanceChartFadeInProps) {
  return (
    <div
      className={["finance-chart-fade-in", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
