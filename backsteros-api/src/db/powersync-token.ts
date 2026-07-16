import { signPowerSyncToken } from "../lib/powersync-auth.js";

const subject = process.argv[2] ?? "owner";

signPowerSyncToken(subject)
  .then((token) => {
    console.log(token);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
