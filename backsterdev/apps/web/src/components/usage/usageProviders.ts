import type { UsageProviderKind } from "@t3tools/contracts";
import { createElement, type SVGProps } from "react";

import {
  AntigravityIcon,
  ClaudeAI,
  CursorIcon,
  GrokIcon,
  type Icon,
  OpenAI,
  OpenCodeIcon,
} from "../Icons";

type UsageProviderPresentation = {
  readonly label: string;
  readonly color: string;
  readonly mark: Icon;
};

/** Simple letter mark — Pi has no dedicated brand SVG in Icons yet. */
const PiIcon: Icon = (props: SVGProps<SVGSVGElement>) =>
  createElement(
    "svg",
    { ...props, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
    createElement(
      "text",
      {
        x: "8",
        y: "12",
        textAnchor: "middle",
        fontSize: "11",
        fontWeight: "600",
        fill: "currentColor",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      },
      "π",
    ),
  );

/**
 * Exhaustive presentation for providers supported by the usage contract.
 * Declaration order is reused by every chart and table, so adding a provider
 * only requires its contract support and one entry here.
 */
export const PROVIDER_PRESENTATION = {
  codex: {
    label: "Codex",
    color: "var(--contrast-foreground)",
    mark: OpenAI,
  },
  claude: {
    label: "Claude Code",
    color: "#d97757",
    mark: ClaudeAI,
  },
  grok: {
    label: "Grok Build",
    // Contrast-aware neutral between the Codex series and muted chart chrome.
    color: "color-mix(in oklab, var(--contrast-foreground) 72%, var(--background))",
    mark: GrokIcon,
  },
  cursor: { label: "Cursor", color: "#8b8b8b", mark: CursorIcon },
  opencode: { label: "OpenCode", color: "#5b9bbd", mark: OpenCodeIcon },
  antigravity: { label: "Antigravity", color: "#8c7bd1", mark: AntigravityIcon },
  pi: { label: "Pi", color: "#6b8f71", mark: PiIcon },
} satisfies Record<UsageProviderKind, UsageProviderPresentation>;

/** Stable provider reading order across charts, summaries, tables, and hover rows. */
export const PROVIDER_ORDER = Object.keys(PROVIDER_PRESENTATION) as UsageProviderKind[];

/** Providers with real activity, independent of the metric currently displayed. */
export function providersWithUsage(
  totals: readonly {
    readonly provider: UsageProviderKind;
    readonly costUsd: number;
    readonly totalTokens: number;
  }[],
): readonly UsageProviderKind[] {
  const active = new Set(
    totals
      .filter((entry) => entry.totalTokens > 0 || entry.costUsd > 0)
      .map((entry) => entry.provider),
  );
  return PROVIDER_ORDER.filter((provider) => active.has(provider));
}
