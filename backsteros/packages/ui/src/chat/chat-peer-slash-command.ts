import type { ChatThreadPeer } from "../components/chat/chat-thread-header.js";

/** Normalize a peer display name into a `/command` slug (`Jaap Vries` → `jaapvries`). */
export function peerCommandSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * If `text` is a lone `/query` command, return the query (lowercased, stripped).
 * Returns `""` for bare `/`, or `null` when the text is not a slash command.
 */
export function parsePeerSlashCommand(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  // Only treat the whole composer value as a command (not mid-sentence).
  if (/\s/.test(trimmed.slice(1))) return null;
  return trimmed.slice(1).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Peers whose name / first name slug starts with `query` (empty query → all). */
export function matchPeersBySlashQuery(
  peers: readonly ChatThreadPeer[],
  query: string,
): ChatThreadPeer[] {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!q) return [...peers];
  return peers.filter((peer) => {
    const full = peerCommandSlug(peer.name);
    const first = peerCommandSlug(peer.name.split(/\s+/)[0] ?? "");
    return full.startsWith(q) || first.startsWith(q);
  });
}

/**
 * Resolve a submitted `/name` to a single peer. Prefers exact first-name /
 * full-name slug matches; otherwise requires a unique prefix match.
 */
export function resolvePeerSlashCommand(
  text: string,
  peers: readonly ChatThreadPeer[],
): ChatThreadPeer | null {
  const query = parsePeerSlashCommand(text);
  if (query == null || query.length === 0) return null;
  const matches = matchPeersBySlashQuery(peers, query);
  if (matches.length === 0) return null;

  const exact = matches.find((peer) => {
    const full = peerCommandSlug(peer.name);
    const first = peerCommandSlug(peer.name.split(/\s+/)[0] ?? "");
    return full === query || first === query;
  });
  if (exact) return exact;
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
