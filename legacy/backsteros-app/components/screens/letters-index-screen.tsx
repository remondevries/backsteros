"use client";

import type { Letter as ApiLetter } from "@backsteros/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { LetterComposeView } from "@/components/letters/letter-compose-view";
import { LetterDetailSkeleton } from "@/components/letters/letter-detail-skeleton";
import { ListLayoutBreadcrumb } from "@/components/navigation/list-layout-breadcrumb";
import { useApiResource } from "@/lib/api-context";
import { normalizeLetter } from "@/lib/entity-normalize";
import { getLettersHref } from "@/lib/entity-route-hrefs";
import { getFirstLetterInListOrder } from "@/lib/letters/group-letters-by-status";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { preferLocalOrApi } from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

/** Circle `/letters` redirects to the first letter in status-group list order. */
export function LettersIndexScreen() {
  const router = useRouter();
  const resource = useApiResource<{ letters: ApiLetter[] }>((client) =>
    client.requestJson("/api/v1/letters"),
  );
  const local = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM letters WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC",
  );

  const letters = useMemo(() => {
    const rows = preferLocalOrApi(
      local.data?.map((row) => snakeRow(row) as ApiLetter),
      resource.data?.letters,
    );
    return rows.map(normalizeLetter);
  }, [local.data, resource.data]);

  const first = getFirstLetterInListOrder(letters) ?? null;
  const listLoading = resource.loading && !local.data;

  useEffect(() => {
    if (!first) return;
    const href =
      first.number != null ? getLettersHref(first.number) : `/letters/${first.id}`;
    router.replace(href);
  }, [first, router]);

  if (listLoading || first) {
    return (
      <>
        <ListLayoutBreadcrumb label="Letters" />
        <LetterDetailSkeleton />
      </>
    );
  }

  return <LetterComposeView />;
}
