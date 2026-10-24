import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveUserDataPath } from "./DesktopUserData.ts";

it.effect("uses the BacksterDEV Application Support profile on macOS", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "backsterdev-profile-" });
    const resolved = yield* resolveUserDataPath({
      appDataDirectory: directory,
      isDevelopment: false,
      platform: "darwin",
    });
    assert.equal(resolved, path.join(directory, "backsterdev"));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("preserves Windows credential keys from t3code without copying browser databases", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "backsterdev-profile-" });
    const source = path.join(directory, "t3code");
    const destination = path.join(directory, "backsterdev");
    const state = '{"os_crypt":{"encrypted_key":"test-encrypted-key"}}';
    yield* fs.makeDirectory(path.join(source, "IndexedDB"), { recursive: true });
    yield* fs.writeFileString(path.join(source, "Local State"), state);
    yield* fs.writeFileString(path.join(source, "IndexedDB", "LOCK"), "V1 owns this database");
    yield* resolveUserDataPath({
      appDataDirectory: directory,
      isDevelopment: false,
      platform: "win32",
    });
    assert.equal(yield* fs.readFileString(path.join(destination, "Local State")), state);
    assert.equal(yield* fs.readFileString(path.join(source, "Local State")), state);
    assert.isFalse(yield* fs.exists(path.join(destination, "IndexedDB")));
    yield* fs.writeFileString(path.join(destination, "Local State"), "existing profile state");
    yield* resolveUserDataPath({
      appDataDirectory: directory,
      isDevelopment: false,
      platform: "win32",
    });
    assert.equal(
      yield* fs.readFileString(path.join(destination, "Local State")),
      "existing profile state",
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
