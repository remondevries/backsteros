export type TaskStatusColorScheme = "light" | "dark";

export type TaskStatusOklch = {
  l: number;
  c: number;
  h: number;
};

const OKLCH_CSS_PATTERN =
  /^oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg|)\s*(?:\/\s*[0-9.]+%?)?\s*\)$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parsePercent(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    return Number(trimmed.slice(0, -1)) / 100;
  }
  return Number(trimmed);
}

function linearizeChannel(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
  if (!match) return null;

  const hex = match[1]!;
  if (hex.length === 3) {
    const r = Number.parseInt(hex[0]! + hex[0]!, 16);
    const g = Number.parseInt(hex[1]! + hex[1]!, 16);
    const b = Number.parseInt(hex[2]! + hex[2]!, 16);
    return { r: r / 255, g: g / 255, b: b / 255 };
  }

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return { r: r / 255, g: g / 255, b: b / 255 };
}

function rgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const lr = linearizeChannel(r);
  const lg = linearizeChannel(g);
  const lb = linearizeChannel(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function oklabToOklch(L: number, a: number, b: number): TaskStatusOklch {
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  if (c < 0.0001) h = 0;
  return { l: L, c, h };
}

function rgbToOklch(r: number, g: number, b: number): TaskStatusOklch {
  const lab = rgbToOklab(r, g, b);
  return oklabToOklch(lab.L, lab.a, lab.b);
}

export function formatTaskStatusOklch(color: TaskStatusOklch): string {
  return `oklch(${color.l.toFixed(3)} ${color.c.toFixed(3)} ${color.h.toFixed(1)})`;
}

export function parseTaskStatusColor(input?: string | null): TaskStatusOklch | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  const hexRgb = parseHexColor(trimmed);
  if (hexRgb) {
    return rgbToOklch(hexRgb.r, hexRgb.g, hexRgb.b);
  }

  const oklchMatch = trimmed.match(OKLCH_CSS_PATTERN);
  if (oklchMatch) {
    return {
      l: parsePercent(oklchMatch[1]!),
      c: Number(oklchMatch[2]!),
      h: Number(oklchMatch[3]!),
    };
  }

  return null;
}

export function adaptTaskStatusOklch(
  color: TaskStatusOklch,
  colorScheme: TaskStatusColorScheme,
): TaskStatusOklch {
  const neutral = color.c < 0.02;

  if (colorScheme === "dark") {
    if (neutral) {
      return { ...color, l: clamp(Math.max(color.l, 0.72), 0, 1), c: color.c };
    }
    if (color.l < 0.62) {
      return { ...color, l: clamp(color.l + (0.68 - color.l) * 0.4, 0, 1) };
    }
    if (color.l > 0.9) {
      return { ...color, l: clamp(color.l - 0.05, 0, 1) };
    }
    return color;
  }

  if (neutral && color.l > 0.86) {
    return { ...color, l: clamp(color.l - 0.1, 0, 1) };
  }
  if (color.l > 0.93) {
    return { ...color, l: clamp(color.l - 0.04, 0, 1) };
  }
  return color;
}

const DEFAULT_STATUS_HEX: Record<string, string> = {
  triage: "#ee7a47",
  on_hold: "#da615d",
  in_progress: "#e9c141",
  in_review: "#52a450",
  completed: "#606acc",
};

const DEFAULT_STATUS_OKLCH: Record<string, TaskStatusOklch> = {
  triage: { l: 0.72, c: 0.16, h: 45.0 },
  backlog: { l: 0.813, c: 0.01, h: 258.3 },
  ready_to_start: { l: 0.913, c: 0, h: 0 },
  in_progress: { l: 0.831, c: 0.17, h: 85.0 },
  on_hold: { l: 0.78, c: 0.12, h: 55.0 },
  in_review: { l: 0.79, c: 0.16, h: 305.0 },
  completed: { l: 0.571, c: 0.17, h: 274.4 },
  canceled: { l: 0.913, c: 0, h: 0 },
  duplicated: { l: 0.74, c: 0.08, h: 258.3 },
};

export function resolveTaskStatusColorScheme(
  colorScheme?: TaskStatusColorScheme,
): TaskStatusColorScheme {
  if (colorScheme) return colorScheme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function subscribeToPreferredColorScheme(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }

  const media = window.matchMedia("(prefers-color-scheme: light)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

export function getPreferredColorSchemeSnapshot(): TaskStatusColorScheme {
  return resolveTaskStatusColorScheme();
}

export function resolveTaskStatusColor(
  statusKey: string,
  colorOverride?: string,
  options?: { colorScheme?: TaskStatusColorScheme },
): string {
  if (colorOverride?.trim()) {
    const parsed = parseTaskStatusColor(colorOverride);
    if (parsed) {
      const scheme = resolveTaskStatusColorScheme(options?.colorScheme);
      return formatTaskStatusOklch(adaptTaskStatusOklch(parsed, scheme));
    }
    return colorOverride.trim();
  }

  const hexDefault = DEFAULT_STATUS_HEX[statusKey];
  if (hexDefault) {
    return hexDefault;
  }

  const scheme = resolveTaskStatusColorScheme(options?.colorScheme);
  const base =
    DEFAULT_STATUS_OKLCH[statusKey] ?? DEFAULT_STATUS_OKLCH.in_progress!;
  return formatTaskStatusOklch(adaptTaskStatusOklch(base, scheme));
}
