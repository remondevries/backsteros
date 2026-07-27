"use client";

import type { Document as ApiDocument } from "@backsteros/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { DocumentsEmptyCreatePrompt } from "@/components/documents/documents-empty-create-prompt";
import { KnowledgeDetailSkeleton } from "@/components/knowledge/knowledge-detail-skeleton";
import { KnowledgeLayoutBreadcrumb } from "@/components/knowledge/knowledge-layout-breadcrumb";
import { useApiResource } from "@/lib/api-context";
import { getKnowledgeDocumentHref } from "@/lib/knowledge/navigation-path";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { mergeLocalAndApiByUpdatedAt } from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

/** Circle `/knowledge` redirects to the first readable document in list order. */
export function KnowledgeIndexScreen() {
  const router = useRouter();
  const resource = useApiResource<{ documents: ApiDocument[] }>((client) =>
    client.requestJson("/api/v1/documents?type=knowledge"),
  );
  const local = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM documents WHERE deleted_at IS NULL AND type = 'knowledge' ORDER BY sort_order, path, updated_at DESC",
  );

  const documents = useMemo(() => {
    const rows = mergeLocalAndApiByUpdatedAt(
      local.data?.map((row) => snakeRow(row) as ApiDocument),
      resource.data?.documents,
    );
    return [...rows]
      .filter((doc) => doc.kind !== "folder" && !doc.deletedAt)
      .sort((a, b) =>
        (a.path || a.title || "").localeCompare(b.path || b.title || "", undefined, {
          sensitivity: "base",
        }),
      );
  }, [local.data, resource.data]);

  const first = documents[0] ?? null;
  const listLoading = resource.loading && !local.data;

  useEffect(() => {
    if (!first) return;
    router.replace(getKnowledgeDocumentHref(first.path || first.id));
  }, [first, router]);

  if (listLoading || first) {
    return (
      <>
        <KnowledgeLayoutBreadcrumb />
        <KnowledgeDetailSkeleton />
      </>
    );
  }

  return (
    <>
      <KnowledgeLayoutBreadcrumb />
      <DocumentsEmptyCreatePrompt variant="knowledge" />
    </>
  );
}
