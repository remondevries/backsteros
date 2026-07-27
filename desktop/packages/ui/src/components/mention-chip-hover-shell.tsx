"use client";

import type { ReactElement, ReactNode } from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "./hover-card.js";

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

  return (
    <HoverCard openDelay={150} closeDelay={120}>
      <HoverCardTrigger
        asChild={asChild ?? isBlock}
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
