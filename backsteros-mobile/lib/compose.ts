/** Compose destination constants — mirrors `@backsteros/ui` compose-task. */

export const COMPOSE_NO_PROJECT_VALUE = "__no_project__";
export const COMPOSE_KNOWLEDGE_BASE_VALUE = "__knowledge_base__";

export type ComposeKind = "task" | "document";

export function isComposeKnowledgeBaseValue(
  value: string | null | undefined,
): boolean {
  return value === COMPOSE_KNOWLEDGE_BASE_VALUE;
}

export function documentPathFromTitle(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled";
  return `${slug}.md`;
}
