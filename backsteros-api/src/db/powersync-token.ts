import { signPowerSyncToken } from "../lib/powersync-auth.js";

const subject = process.argv[2] ?? "owner";
const workspaceId = process.argv[3] ?? "ws_legacy_default";

signPowerSyncToken(subject, workspaceId)
  .then((token) => {
    console.log(token);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
