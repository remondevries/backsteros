/**
 * Write deploy/cloud/powersync.generated.yaml for the cloud PowerSync profile.
 * Does not print secrets.
 *
 *   set -a && source deploy/cloud/.env && set +a
 *   node deploy/cloud/render-powersync-config.mjs
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const secret = process.env.POWERSYNC_JWT_SECRET?.trim();
const password = process.env.POWERSYNC_DB_PASSWORD?.trim();
const user = process.env.POSTGRES_USER?.trim() || "backsteros";
const db = process.env.POSTGRES_DB?.trim() || "backsteros";

if (!secret) {
  console.error("POWERSYNC_JWT_SECRET is required");
  process.exit(1);
}
if (!password) {
  console.error(
    "POWERSYNC_DB_PASSWORD is required (powersync_role password from db:powersync-setup)",
  );
  process.exit(1);
}

const k = Buffer.from(secret).toString("base64url");
const uri = `postgresql://powersync_role:${encodeURIComponent(password)}@postgres:5432/${db}`;
void user;

const yaml = `# Generated. Do not commit.
replication:
  connections:
    - type: postgresql
      uri: ${uri}
      sslmode: disable

storage:
  type: mongodb
  uri: mongodb://mongo:27017/powersync_storage?replicaSet=rs0&directConnection=true

sync_config:
  path: /config/sync-config.yaml

client_auth:
  audience: ["backsteros-powersync"]
  jwks:
    keys:
      - kty: oct
        alg: HS256
        kid: backsteros-powersync-1
        k: ${k}
`;

const out = path.join(dir, "powersync.generated.yaml");
// 0644, not 0600. The file sits under /root (mode 0700), so host users cannot
// traverse to it. The PowerSync container runs as non-root and cannot read 0600.
writeFileSync(out, yaml, { mode: 0o644 });
console.log(`wrote ${out}`);
