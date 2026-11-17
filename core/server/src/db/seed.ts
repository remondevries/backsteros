import { AGENT_API_KEY_SCOPES } from "@backsteros/contracts";

import { createBootstrapApiKey } from "../services/api-keys.js";

async function main() {
  // Access bootstrap key: non-door scopes only (OS-182 / OS-183).
  const { row, secret } = await createBootstrapApiKey("bootstrap", [
    ...AGENT_API_KEY_SCOPES,
  ]);

  console.log("Bootstrap API key created.");
  console.log(`id: ${row.id}`);
  console.log(`prefix: ${row.prefix}`);
  console.log(`secret (save now — shown once): ${secret}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
