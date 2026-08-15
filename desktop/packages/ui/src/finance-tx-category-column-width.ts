import { useLayoutEffect, useMemo, useState, type CSSProperties } from "react";

/** Fallback when no category labels are available. */
export const DEFAULT_TX_CATEGORY_COLUMN_PX = 120;

/**
 * Chip chrome outside the label: horizontal padding (8+8) + gap (6) + color
 * dot (8). Matches `.property-dropdown-trigger--inline-chip` + category trigger.
 */
export const TX_CATEGORY_CHIP_CHROME_PX = 30;

/** Extra px so subpixel rounding / letterforms don't clip the longest label. */
export const TX_CATEGORY_COLUMN_SLACK_PX = 4;

const LABEL_PROBE_STYLE = [
  "position:absolute",
  "visibility:hidden",
  "pointer-events:none",
  "white-space:nowrap",
  "font-size:13px",
  "font-weight:500",
  "line-height:16px",
  "font-family:inherit",
].join(";");

function measureLabelWidthPx(labels: ReadonlyArray<string>): number {
  if (typeof document === "undefined" || labels.length === 0) return 0;
  const probe = document.createElement("span");
  probe.style.cssText = LABEL_PROBE_STYLE;
  document.body.appendChild(probe);
  let max = 0;
  for (const label of labels) {
    probe.textContent = label;
    max = Math.max(max, probe.offsetWidth);
  }
  document.body.removeChild(probe);
  return Math.ceil(max);
}

/**
 * Pixel width for the transaction-row category column so chips align across
 * rows. Uses the widest category (or empty) label among `categoryNames`, plus
 * chip chrome — same idea as {@link computeTaskDisplayIdColumnCh}.
 */
export function computeTxCategoryColumnWidthPx(
  categoryNames: ReadonlyArray<string>,
  options?: {
    /** Extra empty-state labels shown in the chip (e.g. Uncategorized). */
    emptyLabels?: ReadonlyArray<string>;
    minPx?: number;
  },
): number {
  const emptyLabels = options?.emptyLabels ?? [
    "Uncategorized",
    "No category",
  ];
  const minPx = options?.minPx ?? DEFAULT_TX_CATEGORY_COLUMN_PX;
  const labels = new Set<string>();
  for (const name of emptyLabels) {
    if (name.trim()) labels.add(name);
  }
  for (const name of categoryNames) {
    const trimmed = name.trim();
    if (trimmed) labels.add(trimmed);
  }
  const textPx = measureLabelWidthPx([...labels]);
  return Math.max(
    minPx,
    textPx + TX_CATEGORY_CHIP_CHROME_PX + TX_CATEGORY_COLUMN_SLACK_PX,
  );
}

/** Inline style that sets `--finance-tx-category-w` for category cells. */
export function txCategoryColumnCssVars(widthPx: number): CSSProperties {
  return {
    ["--finance-tx-category-w" as string]: `${Math.round(widthPx)}px`,
  };
}

/** Measure category column width from category name list (client-only). */
export function useTxCategoryColumnWidthPx(
  categoryNames: ReadonlyArray<string>,
  options?: {
    emptyLabels?: ReadonlyArray<string>;
    minPx?: number;
  },
): number {
  const emptyKey = (options?.emptyLabels ?? ["Uncategorized", "No category"]).join(
    "\0",
  );
  const namesKey = useMemo(
    () =>
      [...new Set(categoryNames.map((name) => name.trim()).filter(Boolean))]
        .sort()
        .join("\0"),
    [categoryNames],
  );
  const minPx = options?.minPx ?? DEFAULT_TX_CATEGORY_COLUMN_PX;

  const [widthPx, setWidthPx] = useState(minPx);

  useLayoutEffect(() => {
    const names = namesKey ? namesKey.split("\0") : [];
    const emptyLabels = emptyKey ? emptyKey.split("\0") : [];
    setWidthPx(
      computeTxCategoryColumnWidthPx(names, { emptyLabels, minPx }),
    );
  }, [emptyKey, minPx, namesKey]);

  return widthPx;
}
