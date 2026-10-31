import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  developmentFromLegacyLocations,
  mirrorProjectLocationCompat,
  normalizeProjectDevelopment,
  normalizeProjectProduction,
  productionFromLegacyLocations,
} from "./project-locations.js";

describe("project locations", () => {
  it("normalizes local Development and drops empty host", () => {
    assert.deepEqual(
      normalizeProjectDevelopment({
        kind: "local",
        path: "  /Users/me/app  ",
        host: "ignored",
      }),
      { kind: "local", path: "/Users/me/app" },
    );
  });

  it("keeps host on server Development", () => {
    assert.deepEqual(
      normalizeProjectDevelopment({
        kind: "server",
        path: "/home/deploy/app",
        host: " development ",
      }),
      { kind: "server", path: "/home/deploy/app", host: "development" },
    );
  });

  it("rejects empty Production", () => {
    assert.equal(
      normalizeProjectProduction({
        server: "  ",
        url: null,
        deployMethod: null,
        branch: null,
        path: null,
      }),
      null,
    );
  });

  it("mirrors local Development into localWorkingDirectory", () => {
    assert.deepEqual(
      mirrorProjectLocationCompat({
        development: { kind: "local", path: "/Users/me/app" },
        production: null,
        previousLocalWorkingDirectory: "/old",
      }),
      {
        localWorkingDirectory: "/Users/me/app",
        developmentLocation: "/Users/me/app",
        productionLocation: null,
      },
    );
  });

  it("keeps previous local cwd when Development is server", () => {
    assert.deepEqual(
      mirrorProjectLocationCompat({
        development: {
          kind: "server",
          path: "/home/deploy/app",
          host: "development",
        },
        production: {
          server: "prod",
          path: "/var/www",
          url: null,
          deployMethod: "Kamal",
          branch: "main",
        },
        previousLocalWorkingDirectory: "/Users/me/app",
      }),
      {
        localWorkingDirectory: "/Users/me/app",
        developmentLocation: "/home/deploy/app",
        productionLocation: "/var/www",
      },
    );
  });

  it("builds Development from legacy local-only columns", () => {
    assert.deepEqual(
      developmentFromLegacyLocations({
        localWorkingDirectory: "/Users/me/app",
        developmentLocation: null,
      }),
      { kind: "local", path: "/Users/me/app" },
    );
  });

  it("prefers Mac path when legacy Local and Development conflict", () => {
    assert.deepEqual(
      developmentFromLegacyLocations({
        localWorkingDirectory: "/Users/me/app",
        developmentLocation: "/home/deploy/Test",
      }),
      { kind: "local", path: "/Users/me/app" },
    );
  });

  it("builds Production from legacy path", () => {
    assert.deepEqual(
      productionFromLegacyLocations({
        productionLocation: "/var/www",
      }),
      {
        path: "/var/www",
        server: null,
        url: null,
        deployMethod: null,
        branch: null,
      },
    );
  });
});
