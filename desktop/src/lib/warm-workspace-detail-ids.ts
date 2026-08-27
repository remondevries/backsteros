/** First on-demand detail targets to warm at boot (not a vault replica). */

export function firstKnowledgeDocumentIdForWarm(
  documents: readonly { id: string; kind?: string | null }[],
): string | null {
  return documents.find((doc) => doc.kind !== "folder")?.id ?? null;
}

export function firstLetterIdForWarm(
  letters: readonly { id: string }[],
): string | null {
  return letters[0]?.id ?? null;
}
