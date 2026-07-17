"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ChevronRightIcon } from "@primer/octicons-react";

import { useIsMobileUi } from "@/hooks/use-circle-platform";

type PropertyDropdownNavigateRowProps = {
  children: ReactNode;
  navigateHref?: string | null;
  navigateLabel?: string;
};

export function PropertyDropdownNavigateRow({
  children,
  navigateHref,
  navigateLabel = "Open",
}: PropertyDropdownNavigateRowProps) {
  const isMobileUi = useIsMobileUi();
  const showNavigateLink = Boolean(navigateHref) && !isMobileUi;

  return (
    <div className="flex w-fit max-w-full min-w-0 items-center gap-1">
      <div className="min-w-0">{children}</div>
      {showNavigateLink ? (
        <Link
          href={navigateHref!}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-foreground/45 transition-colors hover:bg-white/[0.04] hover:text-foreground/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/25"
          aria-label={navigateLabel}
          title={navigateLabel}
        >
          <ChevronRightIcon size={12} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
