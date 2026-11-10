/**
 * After a local save, PowerSync often bumps `content_version` / checksum and
 * re-triggers the content effect. Remounting via `loading` flashes the
 * document skeleton — keep the editor mounted and soft-revalidate instead.
 */
export function shouldHardLoadDocumentContent(input: {
  localContentVersion: number | null | undefined;
  syncedContentVersion: number | null | undefined;
  knownChecksum?: string | null;
  cachedChecksumTrusted: boolean;
}): "skip" | "refresh" | "load" {
  const local = input.localContentVersion;
  if (local == null) return "load";

  const synced = input.syncedContentVersion;
  if (synced != null && local >= synced && input.cachedChecksumTrusted) {
    return "skip";
  }

  return "refresh";
}
