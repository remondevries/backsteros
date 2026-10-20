"use client";

import { Hub, Riffle } from "@lucasmarkes/hairline/react";
import type { ReactNode } from "react";

export type HairlineEmptyFigureKind = "riffle" | "hub";

export type HairlineEmptyFigureProps = {
  /** Accessible name for the figure. */
  label?: string;
  /** Optional short caption under the figure. Omit for figure-only empty states. */
  caption?: ReactNode;
  /** Figure width in CSS pixels. Docs recommend 160–240 for empty states. */
  size?: number;
  /** Hairline figure — Riffle for docs/files, Hub for commits/PRs. */
  figure?: HairlineEmptyFigureKind;
  className?: string;
};

/**
 * Hairline pointer-reactive empty-state illustration for content panes.
 * Prefer figure + short caption (“No documents”, “No commits”) over long prose.
 */
export function HairlineEmptyFigure({
  label = "Empty",
  caption,
  size = 200,
  figure = "riffle",
  className = "",
}: HairlineEmptyFigureProps) {
  const Figure = figure === "hub" ? Hub : Riffle;

  return (
    <div
      className={["hairline-empty-figure", className].filter(Boolean).join(" ")}
    >
      <Figure
        style={{ width: size }}
        label={label}
        intensity={0.45}
        theme="auto"
      />
      {caption ? (
        <p className="hairline-empty-figure__caption">{caption}</p>
      ) : null}
    </div>
  );
}
