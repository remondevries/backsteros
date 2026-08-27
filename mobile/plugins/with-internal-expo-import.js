const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Align generated AppDelegate.swift with Expo SDK 55 + Swift 6 / Xcode 26:
 * - `internal import Expo`
 * - non-public AppDelegate
 * - `@main` instead of `@UIApplicationMain`
 * - drop removed `bindReactNativeFactory`
 * Remove once `expo prebuild` templates ship these.
 */
function withInternalExpoImport(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const candidates = fs
        .readdirSync(projectRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(projectRoot, entry.name, "AppDelegate.swift"));
      for (const file of candidates) {
        if (!fs.existsSync(file)) continue;
        let next = fs.readFileSync(file, "utf8");
        const before = next;
        next = next.replace(/^import Expo$/m, "internal import Expo");
        next = next.replace(/@UIApplicationMain\n/, "@main\n");
        next = next.replace(/public class AppDelegate/, "class AppDelegate");
        next = next.replace(/public override func/g, "override func");
        next = next.replace(/^\s*bindReactNativeFactory\(factory\)\s*\n/m, "");
        if (next !== before) {
          fs.writeFileSync(file, next, "utf8");
        }
      }
      return cfg;
    },
  ]);
}

module.exports = withInternalExpoImport;
