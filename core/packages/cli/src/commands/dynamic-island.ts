import { homedir } from "node:os";

import type { CliClient, CliConfig } from "../config.js";
import { emitResult } from "../output.js";
import {
  DYNAMIC_ISLAND_DEFAULT_API_URL,
  loopbackApiUrl,
  writeDynamicIslandEnvFile,
} from "./dynamic-island-env.js";

type PairResponse = {
  apiKey: {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
  };
  secret: string;
};

export async function runDynamicIslandCommand(
  client: CliClient,
  config: CliConfig,
  action: string | undefined,
): Promise<void> {
  if (action !== "pair") {
    throw new Error("Usage: backsteros dynamic-island pair");
  }

  const res = await client.requestJson<PairResponse>(
    "/api/v1/dynamic-island/pair",
    { method: "POST" },
  );
  const home =
    process.env.BACKSTEROS_DYNAMIC_ISLAND_HOME?.trim() || homedir();
  await writeDynamicIslandEnvFile({
    home,
    apiUrl: loopbackApiUrl(config.baseUrl) || DYNAMIC_ISLAND_DEFAULT_API_URL,
    apiKey: res.secret,
  });

  emitResult(
    config.json,
    {
      ok: true,
      apiKey: {
        id: res.apiKey.id,
        name: res.apiKey.name,
        prefix: res.apiKey.prefix,
        scopes: res.apiKey.scopes,
      },
    },
    `Paired Dynamic Island as ${res.apiKey.name} (${res.apiKey.prefix}…). Restart Dynamic Island.app so it reloads ~/.config/dynamic-island/backsteros.env.`,
  );
}
