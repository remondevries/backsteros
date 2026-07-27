"use client";

import { cloneElement, type ReactElement, type ReactNode } from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { MentionChipLayout } from "@/lib/documents/mentions/mention-layout";

type MentionChipHoverShellProps = {
  trigger: ReactElement;
  hoverContent: ReactNode;
  layout?: MentionChipLayout;
  onNavigate?: () => void;
};

export function MentionChipHoverShell({
  trigger,
  hoverContent,
  layout = "inline",
  onNavigate,
}: MentionChipHoverShellProps) {
  const isBlock = layout === "block";
  const instrumentedTrigger = onNavigate
    ? cloneElement(trigger as ReactElement<{ onClick?: () => void }>, {
        onClick: onNavigate,
      })
    : trigger;

  return (
    <HoverCard openDelay={150} closeDelay={120}>
      <HoverCardTrigger
        asChild={isBlock}
        className={
          isBlock
            ? "mention-chip-block"
            : "inline align-baseline mention-chip-inline"
        }
      >
        {instrumentedTrigger}
      </HoverCardTrigger>
      <HoverCardContent
        className="pointer-events-auto z-[100] w-80 overflow-hidden rounded-lg border border-white/10 bg-background p-0 text-foreground shadow-lg"
        align="start"
        side="top"
        sideOffset={6}
      >
        {hoverContent}
      </HoverCardContent>
    </HoverCard>
  );
}
