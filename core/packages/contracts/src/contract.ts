import type { AppRouter } from "@ts-rest/core";

import { cloudflareContract } from "./cloudflare-contract.js";
import { fileTaskCallbackContract } from "./file-task-callback-contract.js";
import { transipContract } from "./transip-contract.js";
import { apiContract } from "./routes/index.js";

export { apiContract };

export type ApiContract = AppRouter;

/**
 * Main API + Cloudflare/Transip split routers.
 * Typed as AppRouter so declaration emit stays under TS7056.
 */
export type FullApiContract = AppRouter;

export const fullApiContract: FullApiContract = {
  ...apiContract,
  ...cloudflareContract,
  ...fileTaskCallbackContract,
  ...transipContract,
};
