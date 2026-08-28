/**
 * When vault disk bytes drift from documents row metadata (external edit,
 * vault replication without metadata sync), GET/PATCH must heal before
 * clients trust content_version / ifMatch.
 *
 * Empty disk never heals over a nonempty row — same invariant as
 * syncDocumentMetadataFromStorageKey / EMPTY_BODY_OVER_NONEMPTY.
 */

export function diskContentNeedsMetadataHeal(input: {
  rowByteSize: number;
  rowChecksum: string | null;
  diskByteSize: number;
  diskChecksum: string | null;
}): boolean {
  if (input.diskByteSize === 0) {
    return false;
  }
  if (input.rowByteSize === 0) {
    return true;
  }
  if (input.rowByteSize !== input.diskByteSize) {
    return true;
  }
  if (input.rowChecksum !== input.diskChecksum) {
    return true;
  }
  return false;
}
