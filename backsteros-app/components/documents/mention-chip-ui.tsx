import type { ReactNode } from "react";

export const MENTION_CHIP_LINK_INLINE_CLASS =
  "mention-resource-chip group inline-flex w-auto max-w-none cursor-pointer select-none items-center gap-1.5 rounded-md bg-white/[0.08] px-1.5 py-0.5 text-sm text-foreground no-underline hover:no-underline align-baseline transition-colors hover:bg-white/[0.14] hover:text-foreground";

export const MENTION_CHIP_LINK_BLOCK_CLASS =
  "mention-resource-chip mention-resource-chip--block group flex w-full min-w-0 cursor-pointer select-none items-center gap-2 rounded-md border-[0.5px] border-white/10 px-2 py-2.5 text-sm text-foreground no-underline hover:no-underline transition-colors hover:bg-white/[0.03] hover:text-foreground";

export const MENTION_CHIP_DELETED_MODIFIER_CLASS =
  "mention-resource-chip--deleted cursor-default opacity-60 hover:bg-transparent";

export function getMentionChipLinkClass(layout: "inline" | "block"): string {
  return layout === "block"
    ? MENTION_CHIP_LINK_BLOCK_CLASS
    : MENTION_CHIP_LINK_INLINE_CLASS;
}

export const MENTION_CHIP_ICON_CLASS =
  "size-3.5 shrink-0 self-center text-foreground/50 transition-colors group-hover:text-foreground/70";

export const MENTION_CHIP_IDENTIFIER_CLASS =
  "shrink-0 font-medium tracking-tight text-foreground/50 transition-colors group-hover:text-foreground/70";

export const MENTION_CHIP_TITLE_INLINE_CLASS =
  "min-w-0 truncate font-medium tracking-tight text-foreground no-underline";

export const MENTION_CHIP_TITLE_BLOCK_CLASS =
  "min-w-0 flex-1 truncate font-medium tracking-tight text-foreground no-underline";

export function getMentionChipTitleClass(layout: "inline" | "block"): string {
  return layout === "block"
    ? MENTION_CHIP_TITLE_BLOCK_CLASS
    : MENTION_CHIP_TITLE_INLINE_CLASS;
}

export function MentionHoverCardSeparator() {
  return <div className="h-px bg-white/10" aria-hidden="true" />;
}

export function MentionHoverMetaRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-foreground/55">
      {children}
    </div>
  );
}

export function MentionHoverTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-semibold leading-snug text-foreground">
      {children}
    </p>
  );
}

export function MentionHoverFooterRow({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-foreground/55">
      {children}
    </div>
  );
}

export function MentionHoverPanel({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "structured";
}) {
  if (variant === "structured") {
    return <div className="flex flex-col">{children}</div>;
  }

  return <div className="flex flex-col gap-2 p-3">{children}</div>;
}

export function MentionHoverHeader({
  icon,
  title,
}: {
  icon: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 pt-3 pb-2.5">
      {icon}
      <span className="min-w-0 truncate text-sm font-semibold leading-snug text-foreground">
        {title}
      </span>
    </div>
  );
}

export function MentionHoverSection({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="px-3 py-2.5">{children}</div>;
}
