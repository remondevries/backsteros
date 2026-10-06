import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyInfoPlistVersions,
  appBundleChanged,
  describeBacksterAppChanges,
  planMacosInstall,
  rollbackAppName,
  setPlistString,
  snapshotAppBundle,
  STABLE_APP_NAME,
  versionedAppName,
} from "./macos-packaging.mjs";

const ATS_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsArbitraryLoads</key>
		<true/>
	</dict>
</dict>
</plist>
`;

test("applyInfoPlistVersions inserts CFBundle keys into an ATS-only overlay", () => {
  const next = applyInfoPlistVersions(ATS_PLIST, "0.2.271");
  assert.match(next, /<key>CFBundleShortVersionString<\/key>\s*<string>0\.2\.271<\/string>/);
  assert.match(next, /<key>CFBundleVersion<\/key>\s*<string>0\.2\.271<\/string>/);
  assert.match(next, /NSAppTransportSecurity/);
});

test("applyInfoPlistVersions rewrites existing CFBundle keys", () => {
  const withVersion = setPlistString(ATS_PLIST, "CFBundleShortVersionString", "0.1.0");
  const next = applyInfoPlistVersions(withVersion, "0.2.271");
  assert.match(next, /<string>0\.2\.271<\/string>/);
  assert.doesNotMatch(next, /0\.1\.0/);
});

test("planMacosInstall copies to a versioned path and never touches stable by default", () => {
  const plan = planMacosInstall({
    applicationsDir: "/Applications",
    version: "0.2.271",
    replaceStable: false,
    stableExists: true,
    now: new Date("2026-10-06T11:09:00"),
  });
  assert.equal(plan.versionedDest, "/Applications/BacksterOS-0.2.271.app");
  assert.equal(plan.stableDest, `/Applications/${STABLE_APP_NAME}`);
  assert.deepEqual(
    plan.steps.map((s) => s.role),
    ["versioned"],
  );
});

test("planMacosInstall keeps a timestamped rollback before replacing the stable app", () => {
  const now = new Date(2026, 9, 6, 11, 9, 0);
  const plan = planMacosInstall({
    applicationsDir: "/Applications",
    version: "0.2.271",
    replaceStable: true,
    stableExists: true,
    now,
  });
  assert.equal(plan.steps[1]?.role, "rollback");
  assert.equal(plan.steps[1]?.source, "stable");
  assert.equal(plan.steps[1]?.dest, `/Applications/${rollbackAppName(now)}`);
  assert.equal(plan.steps[2]?.role, "stable");
  assert.equal(plan.steps[2]?.source, "versioned");
  assert.equal(versionedAppName("0.2.271"), "BacksterOS-0.2.271.app");
});

test("installMacosApp copies versioned first and can rollback then replace stable", async () => {
  const { installMacosApp } = await import("./install-macos-app.mjs");
  const copies = [];
  const existing = new Set(["/tmp/apps/BacksterOS.app", "/tmp/built/BacksterOS.app"]);
  const now = new Date(2026, 9, 6, 11, 9, 0);
  const plan = installMacosApp({
    builtAppPath: "/tmp/built/BacksterOS.app",
    applicationsDir: "/tmp/apps",
    version: "0.2.271",
    replaceStable: true,
    now,
    exists: (p) => existing.has(p),
    copyBundle: (src, dest) => {
      copies.push([src, dest]);
      existing.add(dest);
    },
  });
  assert.equal(copies[0]?.[1], "/tmp/apps/BacksterOS-0.2.271.app");
  assert.equal(copies[1]?.[0], "/tmp/apps/BacksterOS.app");
  assert.equal(copies[2]?.[0], "/tmp/apps/BacksterOS-0.2.271.app");
  assert.equal(copies[2]?.[1], "/tmp/apps/BacksterOS.app");
  assert.equal(plan.steps.length, 3);
});

test("appBundleChanged detects replace of an existing installed app", () => {
  const before = snapshotAppBundle("/no/such/BacksterOS.app");
  assert.equal(before.exists, false);
  const after = { exists: true, path: "/Applications/BacksterOS.app", mtimeMs: 1, size: 2, ino: 3 };
  assert.equal(appBundleChanged(before, after), true);
  assert.deepEqual(
    describeBacksterAppChanges(
      { dirExists: true, apps: { "BacksterOS.app": before } },
      { dirExists: true, apps: { "BacksterOS.app": after } },
    ),
    ["BacksterOS.app"],
  );
});
