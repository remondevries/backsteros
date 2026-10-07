import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import type {
  ClientEstimateStatus,
  CreateClientEstimateInput,
  ListClientEstimatesQuery,
  UpdateClientEstimateInput,
} from "@backsteros/contracts";
import { CLIENT_ESTIMATE_STATUSES } from "@backsteros/contracts";

import { db } from "../../db/index.js";
import { clientEstimates } from "../../db/schema.js";
import { newId } from "../../lib/crypto.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

function normalizeStatus(
  value: string | null | undefined,
): ClientEstimateStatus {
  if (
    value &&
    (CLIENT_ESTIMATE_STATUSES as readonly string[]).includes(value)
  ) {
    return value as ClientEstimateStatus;
  }
  return "draft";
}

function parseStatusFilter(raw: string | undefined): ClientEstimateStatus[] | null {
  if (!raw?.trim()) return null;
  const values = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part): part is ClientEstimateStatus =>
      (CLIENT_ESTIMATE_STATUSES as readonly string[]).includes(part),
    );
  return values.length > 0 ? values : null;
}

export async function listClientEstimates(
  workspaceId: string,
  query: ListClientEstimatesQuery = {},
) {
  const statuses = parseStatusFilter(query.status);
  const limit = query.limit ?? 100;
  const conditions = [
    eq(clientEstimates.workspaceId, workspaceId),
    isNull(clientEstimates.deletedAt),
  ];
  if (query.organizationId?.trim()) {
    conditions.push(
      eq(clientEstimates.organizationId, query.organizationId.trim()),
    );
  }
  if (statuses) {
    conditions.push(inArray(clientEstimates.status, statuses));
  }

  return db
    .select()
    .from(clientEstimates)
    .where(and(...conditions))
    .orderBy(desc(clientEstimates.updatedAt), asc(clientEstimates.title))
    .limit(limit);
}

export async function getClientEstimateById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(clientEstimates)
    .where(
      and(
        eq(clientEstimates.workspaceId, workspaceId),
        eq(clientEstimates.id, id),
        isNull(clientEstimates.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createClientEstimate(
  workspaceId: string,
  input: CreateClientEstimateInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .insert(clientEstimates)
    .values({
      id,
      workspaceId,
      organizationId: input.organizationId?.trim() || null,
      projectId: input.projectId?.trim() || null,
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || null,
      clientLabel: input.clientLabel?.trim() || null,
      authorName: input.authorName?.trim() || null,
      versionLabel: input.versionLabel?.trim() || null,
      documentDate: input.documentDate?.trim() || null,
      status: normalizeStatus(input.status),
      proposalMarkdown: input.proposalMarkdown ?? "",
      estimateMarkdown: input.estimateMarkdown ?? "",
      sortOrder: input.sortOrder ?? Date.now(),
    })
    .returning();
  return row!;
}

export async function updateClientEstimate(
  workspaceId: string,
  id: string,
  input: UpdateClientEstimateInput,
  executor: DbExecutor = db,
) {
  const patch: Partial<typeof clientEstimates.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.organizationId !== undefined) {
    patch.organizationId = input.organizationId?.trim() || null;
  }
  if (input.projectId !== undefined) {
    patch.projectId = input.projectId?.trim() || null;
  }
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.subtitle !== undefined) {
    patch.subtitle = input.subtitle?.trim() || null;
  }
  if (input.clientLabel !== undefined) {
    patch.clientLabel = input.clientLabel?.trim() || null;
  }
  if (input.authorName !== undefined) {
    patch.authorName = input.authorName?.trim() || null;
  }
  if (input.versionLabel !== undefined) {
    patch.versionLabel = input.versionLabel?.trim() || null;
  }
  if (input.documentDate !== undefined) {
    patch.documentDate = input.documentDate?.trim() || null;
  }
  if (input.status !== undefined) patch.status = normalizeStatus(input.status);
  if (input.proposalMarkdown !== undefined) {
    patch.proposalMarkdown = input.proposalMarkdown;
  }
  if (input.estimateMarkdown !== undefined) {
    patch.estimateMarkdown = input.estimateMarkdown;
  }
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

  const [row] = await executor
    .update(clientEstimates)
    .set(patch)
    .where(
      and(
        eq(clientEstimates.workspaceId, workspaceId),
        eq(clientEstimates.id, id),
        isNull(clientEstimates.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteClientEstimate(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(clientEstimates)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(clientEstimates.workspaceId, workspaceId),
        eq(clientEstimates.id, id),
        isNull(clientEstimates.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/** Mutable bag so route tests can stub handlers without redefining ESM exports. */
export const clientEstimateRouteDeps = {
  listClientEstimates,
  getClientEstimateById,
  createClientEstimate,
  updateClientEstimate,
  deleteClientEstimate,
};
