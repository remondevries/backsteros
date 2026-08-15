import { useLayoutEffect, useMemo, useState } from "react";

/**
 * Measure the widest label with the same type metrics as finance list money
 * columns (12px / 550 / tabular-nums).
 */
export function measureFinanceMoneyLabelWidthPx(labels: string[]): number {
  if (typeof document === "undefined" || labels.length === 0) return 48;
  const probe = document.createElement("span");
  probe.style.cssText = [
    "position:absolute",
    "visibility:hidden",
    "pointer-events:none",
    "white-space:nowrap",
    "font-size:12px",
    "font-weight:550",
    "font-variant-numeric:tabular-nums",
    "font-family:inherit",
  ].join(";");
  document.body.appendChild(probe);
  let max = 0;
  for (const label of labels) {
    probe.textContent = label;
    max = Math.max(max, probe.offsetWidth);
  }
  document.body.removeChild(probe);
  return Math.ceil(max);
}

export function useFinanceMoneyColumnWidthPx(
  labels: ReadonlyArray<string>,
  minPx = 48,
): number {
  const signature = labels.join("\0");
  const [widthPx, setWidthPx] = useState(minPx);

  useLayoutEffect(() => {
    setWidthPx(
      Math.max(minPx, measureFinanceMoneyLabelWidthPx([...labels])),
    );
  }, [minPx, signature]);

  return widthPx;
}

export function useFinanceMoneyColumnWidthFromValues(
  values: ReadonlyArray<string>,
  headerLabels: ReadonlyArray<string> = [],
  minPx = 48,
): number {
  const valuesKey = values.join("\0");
  const headersKey = headerLabels.join("\0");
  const labels = useMemo(() => {
    const set = new Set<string>(["—", ...headerLabels, ...values]);
    return [...set];
  }, [headersKey, valuesKey]);

  return useFinanceMoneyColumnWidthPx(labels, minPx);
}
