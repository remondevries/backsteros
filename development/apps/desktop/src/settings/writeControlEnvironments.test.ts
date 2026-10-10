import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EnvironmentId } from "@t3tools/contracts";
import type { ConnectionCatalogDocument } from "@t3tools/client-runtime/platform";
import { afterEach, describe, expect, it } from "vitest";

import {
  controlEnvironmentsFromCatalog,
  mergeControlEnvironmentMirror,
  writeControlEnvironmentsMirror,
} from "./writeControlEnvironments.ts";

function catalogWithBearer(input: {
  readonly environmentId: string;
  readonly label: string;
  readonly httpBaseUrl: string;
  readonly token: string;
  readonly connectionId?: string;
  readonly disabled?: boolean;
}): ConnectionCatalogDocument {
  const connectionId = input.connectionId ?? `conn-${input.environmentId}`;
  const environmentId = EnvironmentId.make(input.environmentId);
  return {
    schemaVersion: 1,
    targets: [
      {
        _tag: "BearerConnectionTarget" as const,
        environmentId,
        label: input.label,
        connectionId,
      },
    ],
    profiles: [
      {
        _tag: "BearerConnectionProfile" as const,
        connectionId,
        environmentId,
        label: input.label,
        httpBaseUrl: input.httpBaseUrl,
        wsBaseUrl: input.httpBaseUrl.replace(/^http/, "ws"),
      },
    ],
    credentials: [
      {
        connectionId,
        credential: {
          _tag: "BearerConnectionCredential" as const,
          token: input.token,
        },
      },
    ],
    remoteDpopTokens: [],
    disabledEnvironmentIds: input.disabled ? [environmentId] : [],
  };
}

describe("writeControlEnvironments mirror merge (BDV-60)", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("merges catalog rows over existing without dropping PUT-only ids", () => {
    const merged = mergeControlEnvironmentMirror({
      existing: [
        {
          environmentId: "put-only",
          label: "api-put",
          httpBaseUrl: "http://100.1.1.1:3773",
          accessToken: "put-tok",
        },
        {
          environmentId: "shared",
          label: "stale-label",
          httpBaseUrl: "http://old.example:3773",
          accessToken: "old-tok",
        },
      ],
      fromCatalog: [
        {
          environmentId: "shared",
          label: "development",
          httpBaseUrl: "http://100.126.31.97:3773",
          accessToken: "catalog-tok",
        },
        {
          environmentId: "catalog-only",
          label: "lemodesign",
          httpBaseUrl: "http://100.83.125.67:3773",
          accessToken: "lem-tok",
        },
      ],
    });

    expect(merged).toEqual(
      expect.arrayContaining([
        {
          environmentId: "put-only",
          label: "api-put",
          httpBaseUrl: "http://100.1.1.1:3773",
          accessToken: "put-tok",
        },
        {
          environmentId: "shared",
          label: "development",
          httpBaseUrl: "http://100.126.31.97:3773",
          accessToken: "catalog-tok",
        },
        {
          environmentId: "catalog-only",
          label: "lemodesign",
          httpBaseUrl: "http://100.83.125.67:3773",
          accessToken: "lem-tok",
        },
      ]),
    );
    expect(merged).toHaveLength(3);
  });

  it("writeControlEnvironmentsMirror preserves PUT-only remotes across catalog sync", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "control-env-mirror-"));
    dirs.push(stateDir);

    fs.writeFileSync(
      path.join(stateDir, "control-environments.json"),
      `${JSON.stringify(
        {
          version: 1,
          environments: [
            {
              environmentId: "put-only",
              label: "api-put",
              httpBaseUrl: "http://100.1.1.1:3773",
              accessToken: "put-tok",
            },
          ],
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );

    writeControlEnvironmentsMirror({
      stateDir,
      catalog: catalogWithBearer({
        environmentId: "remote-dev",
        label: "development",
        httpBaseUrl: "http://100.126.31.97:3773/",
        token: "dev-tok",
      }),
    });

    const written = JSON.parse(
      fs.readFileSync(path.join(stateDir, "control-environments.json"), "utf8"),
    ) as { environments: Array<{ environmentId: string; accessToken?: string }> };

    expect(written.environments.map((row) => row.environmentId).sort()).toEqual([
      "put-only",
      "remote-dev",
    ]);
    expect(written.environments.find((row) => row.environmentId === "put-only")?.accessToken).toBe(
      "put-tok",
    );
    expect(
      written.environments.find((row) => row.environmentId === "remote-dev")?.accessToken,
    ).toBe("dev-tok");
  });

  it("controlEnvironmentsFromCatalog skips disabled bearer targets", () => {
    expect(
      controlEnvironmentsFromCatalog(
        catalogWithBearer({
          environmentId: "disabled-env",
          label: "disabled",
          httpBaseUrl: "http://example:3773",
          token: "x",
          disabled: true,
        }),
      ),
    ).toEqual([]);
  });
});
