import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createBootstrapApiKey } from "../services/api-keys.js";

async function main() {
  const { row, secret } = await createBootstrapApiKey("bootstrap", [
    ...API_KEY_SCOPES,
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
