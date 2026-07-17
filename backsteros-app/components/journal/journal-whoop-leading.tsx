"use client";

import { useMemo } from "react";

import { useWhoopDaySnapshot } from "@/hooks/use-whoop-day-snapshot";
import { JournalWhoopHeader } from "@/components/whoop/journal-whoop-header";
import type { WhoopSnapshotEntity } from "@/lib/whoop/types";

type JournalWhoopLeadingProps = {
  dateSlug: string;
};

export function JournalWhoopLeading({ dateSlug }: JournalWhoopLeadingProps) {
  const { snapshot, loading, authenticated } = useWhoopDaySnapshot(dateSlug);

  const placeholder = useMemo<WhoopSnapshotEntity>(
    () => ({
      id: `whoop-${dateSlug}`,
      date: dateSlug,
      sleepPerformance: null,
      recoveryScore: null,
      strainScore: null,
    }),
    [dateSlug],
  );

  // Whoop is not configured — don't reserve chart space.
  if (authenticated === false) {
    return null;
  }

  const waiting = loading || authenticated == null;

  // Keep one header mounted: empty rings while fetching, then fill or
  // show "-" when the snapshot resolves (avoids title jump).
  const displaySnapshot = waiting || !snapshot ? placeholder : snapshot;

  return (
    <div
      className="mb-2 min-h-[4.75rem] w-full"
      aria-busy={waiting || undefined}
      aria-hidden="true"
    >
      <JournalWhoopHeader snapshot={displaySnapshot} loading={waiting} />
    </div>
  );
}
