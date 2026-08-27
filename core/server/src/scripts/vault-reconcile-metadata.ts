/**
 * Repair documents.byte_size / snippet from vault files and pull missing bodies
 * from the replication peer when needed.
 *
 * Usage: pnpm vault:reconcile-metadata
 */
import { reconcileVaultDocumentMetadata } from "../services/vault-document-metadata.js";

async function main() {
  const metadataOnly = process.argv.includes("--metadata-only");
  const workspaceId =
    process.env.CORE_REPLICATION_WORKSPACE_IDS?.split(",")[0]?.trim() ??
    "ws_legacy_default";

  const result = await reconcileVaultDocumentMetadata(workspaceId, {
    pullFromPeer: !metadataOnly,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.staleZeroMetadata > 0 || result.missingFileWithBytes > 0) {
    console.log(
      `Reconciled: ${result.metadataUpdated} metadata rows updated, ${result.pulledFromPeer} files pulled from peer.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
