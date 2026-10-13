"use client";

import type { ReactElement, ReactNode } from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../shared/hover-card.js";

export type MentionChipHoverShellProps = {
  trigger: ReactElement;
  hoverContent: ReactNode;
  layout?: "inline" | "block";
  /** Merge trigger props onto the child (required for navigable `<a>` chips). */
  asChild?: boolean;
};

export function MentionChipHoverShell({
  trigger,
  hoverContent,
  layout = "inline",
  asChild,
}: MentionChipHoverShellProps) {
  const isBlock = layout === "block";
  // Inline chips wrap in a span trigger so HoverCard always has a stable DOM
  // node (ClientLink asChild was easy to miss / miss-measure). Block cards keep
  // asChild so the whole card link is the hit target.
  const useAsChild = asChild ?? isBlock;

  return (
    <HoverCard openDelay={150} closeDelay={120}>
      <HoverCardTrigger
        asChild={useAsChild}
        className={
          isBlock
            ? "mention-chip-hover-shell mention-chip-hover-shell--block"
            : "mention-chip-hover-shell mention-chip-hover-shell--inline"
        }
      >
        {trigger}
      </HoverCardTrigger>
      <HoverCardContent
        className="bos-hover-card mention-hover-card"
        align="start"
        side="top"
        sideOffset={6}
      >
        {hoverContent}
      </HoverCardContent>
    </HoverCard>
  );
}
