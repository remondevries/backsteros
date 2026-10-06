import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import {
  appleBundleVersion,
  applyInfoPlistVersions,
  appBundleChanged,
  BUNDLE_EXECUTABLE_FALLBACK,
  describeBacksterAppChanges,
  interpretCodesignVerify,
  macosInstallPaths,
  rollbackAppName,
  setPlistString,
  snapshotAppBundle,
  STABLE_APP_NAME,
  versionedAppName,
  withDefaultTauriBundles,
} from "./macos-packaging.mjs";
import { installMacosApp } from "./install-macos-app.mjs";

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

const VERSION = "0.2.271";
const tmpDirs = [];

function okCodesign() {
  return { verifyStatus: 0, verifyStderr: "", displayOutput: "" };
}

function writeFakeApp(appPath, { version = VERSION, extraFiles = {}, exe = BUNDLE_EXECUTABLE_FALLBACK } = {}) {
  fs.mkdirSync(path.join(appPath, "Contents", "MacOS"), { recursive: true });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>${exe}</string>
	<key>CFBundleShortVersionString</key>
	<string>${version}</string>
	<key>CFBundleVersion</key>
	<string>${appleBundleVersion(version)}</string>
</dict>
</plist>
`;
  fs.writeFileSync(path.join(appPath, "Contents", "Info.plist"), xml);
  fs.writeFileSync(path.join(appPath, "Contents", "MacOS", exe), "#!/bin/sh\necho ok\n");
  for (const [rel, content] of Object.entries(extraFiles)) {
    const full = path.join(appPath, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "os85-packaging-"));
  tmpDirs.push(dir);
  return dir;
}

function pgrepSees(pattern) {
  return (spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" }).status ?? 1) === 0;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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

test("CFBundleVersion strips semver pre-release and build metadata", () => {
  assert.equal(appleBundleVersion("0.2.271-beta.1"), "0.2.271");
  assert.equal(appleBundleVersion("0.2.271+exp.sha"), "0.2.271");
  const xml = applyInfoPlistVersions(ATS_PLIST, "0.2.271-beta.1");
  assert.match(xml, /<key>CFBundleShortVersionString<\/key>\s*<string>0\.2\.271-beta\.1<\/string>/);
  assert.match(xml, /<key>CFBundleVersion<\/key>\s*<string>0\.2\.271<\/string>/);
});

test("macosInstallPaths never targets the stable app for the versioned copy", () => {
  const now = new Date(2026, 9, 6, 11, 9, 0);
  const paths = macosInstallPaths({
    applicationsDir: "/Applications",
    version: VERSION,
    now,
  });
  assert.equal(paths.versionedDest, `/Applications/${versionedAppName(VERSION)}`);
  assert.equal(paths.stableDest, `/Applications/${STABLE_APP_NAME}`);
  assert.equal(paths.rollbackDest, `/Applications/${rollbackAppName(now)}`);
  assert.match(paths.tmpDest, /\.BacksterOS-0\.2\.271\.app\.tmp-/);
});

test("withDefaultTauriBundles only forces app on darwin so Windows keeps conf targets", () => {
  assert.deepEqual(withDefaultTauriBundles(["build"], "darwin"), ["build", "--bundles", "app"]);
  assert.deepEqual(withDefaultTauriBundles(["build"], "win32"), ["build"]);
  assert.deepEqual(withDefaultTauriBundles(["build", "--bundles", "msi"], "darwin"), [
    "build",
    "--bundles",
    "msi",
  ]);
});

test("interpretCodesignVerify requires exit 0 even when the display says ad-hoc", () => {
  assert.equal(interpretCodesignVerify({ verifyStatus: 0, displayOutput: "Signature=adhoc" }).ok, true);
  assert.equal(interpretCodesignVerify({ verifyStatus: 0, displayOutput: "Signature=adhoc" }).adHoc, true);
  const tampered = interpretCodesignVerify({
    verifyStatus: 1,
    verifyStderr: "a sealed resource is missing or invalid",
    displayOutput: "Signature=adhoc",
  });
  assert.equal(tampered.ok, false);
  assert.match(tampered.error ?? "", /sealed resource/);
});

test("snapshotAppBundle detects an in-place overwrite of Contents/MacOS", () => {
  const root = tempRoot();
  const appPath = path.join(root, "BacksterOS.app");
  writeFakeApp(appPath);
  const exeRel = path.join("Contents", "MacOS", BUNDLE_EXECUTABLE_FALLBACK);
  const before = snapshotAppBundle(appPath);
  fs.writeFileSync(
    path.join(appPath, "Contents", "MacOS", BUNDLE_EXECUTABLE_FALLBACK),
    "#!/bin/sh\necho replaced\n",
  );
  const after = snapshotAppBundle(appPath);
  assert.equal(before.files[exeRel]?.exists, true);
  assert.notEqual(before.files[exeRel]?.size, after.files[exeRel]?.size);
  assert.equal(appBundleChanged(before, after), true);
  assert.deepEqual(
    describeBacksterAppChanges(
      { dirExists: true, apps: { "BacksterOS.app": before } },
      { dirExists: true, apps: { "BacksterOS.app": after } },
    ),
    ["BacksterOS.app"],
  );
});

test("existing versioned path is refused without --force", () => {
  const root = tempRoot();
  const applicationsDir = path.join(root, "Applications");
  const built = path.join(root, "built", "BacksterOS.app");
  writeFakeApp(built);
  const versioned = path.join(applicationsDir, versionedAppName(VERSION));
  writeFakeApp(versioned, { extraFiles: { "Contents/Resources/keep-me.txt": "original" } });
  assert.throws(
    () =>
      installMacosApp({
        builtAppPath: built,
        applicationsDir,
        version: VERSION,
        now: new Date(2026, 9, 6, 11, 9, 0),
        isRunning: () => false,
        runCodesign: okCodesign,
      }),
    /already exists/,
  );
  assert.equal(
    fs.readFileSync(path.join(versioned, "Contents", "Resources", "keep-me.txt"), "utf8"),
    "original",
  );
});

test("--replace-stable does not recopy the build and fails if the versioned copy is missing", () => {
  const root = tempRoot();
  const applicationsDir = path.join(root, "Applications");
  const built = path.join(root, "built", "BacksterOS.app");
  writeFakeApp(built, { extraFiles: { "Contents/Resources/from-build.txt": "nope" } });
  let copies = 0;
  assert.throws(
    () =>
      installMacosApp({
        builtAppPath: built,
        applicationsDir,
        version: VERSION,
        replaceStable: true,
        now: new Date(2026, 9, 6, 11, 9, 0),
        isRunning: () => false,
        runCodesign: okCodesign,
        copyBundle: () => {
          copies += 1;
        },
      }),
    /missing versioned copy/,
  );
  assert.equal(copies, 0);
  assert.equal(fs.existsSync(path.join(applicationsDir, STABLE_APP_NAME)), false);
});

test("a stale file in the stable app does not survive replacement", () => {
  const root = tempRoot();
  const applicationsDir = path.join(root, "Applications");
  const now = new Date(2026, 9, 6, 11, 9, 0);
  const versioned = path.join(applicationsDir, versionedAppName(VERSION));
  const stable = path.join(applicationsDir, STABLE_APP_NAME);
  writeFakeApp(versioned, { extraFiles: { "Contents/Resources/fresh.txt": "new" } });
  writeFakeApp(stable, { extraFiles: { "Contents/Resources/stale.txt": "old" } });
  installMacosApp({
    applicationsDir,
    version: VERSION,
    replaceStable: true,
    now,
    isRunning: () => false,
    runCodesign: okCodesign,
  });
  assert.equal(fs.existsSync(path.join(stable, "Contents", "Resources", "stale.txt")), false);
  assert.equal(fs.readFileSync(path.join(stable, "Contents", "Resources", "fresh.txt"), "utf8"), "new");
  const rollback = path.join(applicationsDir, rollbackAppName(now));
  assert.equal(fs.readFileSync(path.join(rollback, "Contents", "Resources", "stale.txt"), "utf8"), "old");
  assert.equal(fs.existsSync(versioned), false);
});

test("tampered ad-hoc codesign verify is refused", () => {
  const root = tempRoot();
  const applicationsDir = path.join(root, "Applications");
  const now = new Date(2026, 9, 6, 11, 9, 0);
  const versioned = path.join(applicationsDir, versionedAppName(VERSION));
  const stable = path.join(applicationsDir, STABLE_APP_NAME);
  writeFakeApp(versioned);
  writeFakeApp(stable, { extraFiles: { "Contents/Resources/stable.txt": "keep" } });
  assert.throws(
    () =>
      installMacosApp({
        applicationsDir,
        version: VERSION,
        replaceStable: true,
        now,
        isRunning: () => false,
        runCodesign: () => ({
          verifyStatus: 1,
          verifyStderr: "a sealed resource is missing or invalid",
          displayOutput: "Signature=adhoc",
        }),
      }),
    /codesign --verify/,
  );
  assert.equal(fs.readFileSync(path.join(stable, "Contents", "Resources", "stable.txt"), "utf8"), "keep");
  assert.equal(fs.existsSync(versioned), true);
});

test("a verify failure leaves the stable app untouched", () => {
  const root = tempRoot();
  const applicationsDir = path.join(root, "Applications");
  const now = new Date(2026, 9, 6, 11, 9, 0);
  const versioned = path.join(applicationsDir, versionedAppName(VERSION));
  const stable = path.join(applicationsDir, STABLE_APP_NAME);
  writeFakeApp(versioned, { version: "9.9.9" });
  writeFakeApp(stable, { extraFiles: { "Contents/Resources/stable.txt": "keep" } });
  assert.throws(
    () =>
      installMacosApp({
        applicationsDir,
        version: VERSION,
        replaceStable: true,
        now,
        isRunning: () => false,
        runCodesign: okCodesign,
      }),
    /CFBundleShortVersionString/,
  );
  assert.equal(fs.readFileSync(path.join(stable, "Contents", "Resources", "stable.txt"), "utf8"), "keep");
  assert.equal(fs.existsSync(path.join(applicationsDir, rollbackAppName(now))), false);
  assert.equal(fs.existsSync(versioned), true);
});

test("a failed rename restores the rollback", () => {
  const root = tempRoot();
  const applicationsDir = path.join(root, "Applications");
  const now = new Date(2026, 9, 6, 11, 9, 0);
  const versioned = path.join(applicationsDir, versionedAppName(VERSION));
  const stable = path.join(applicationsDir, STABLE_APP_NAME);
  writeFakeApp(versioned, { extraFiles: { "Contents/Resources/new.txt": "new" } });
  writeFakeApp(stable, { extraFiles: { "Contents/Resources/stable.txt": "keep" } });
  let renames = 0;
  assert.throws(
    () =>
      installMacosApp({
        applicationsDir,
        version: VERSION,
        replaceStable: true,
        now,
        isRunning: () => false,
        runCodesign: okCodesign,
        rename: (from, to) => {
          renames += 1;
          if (renames === 2) throw new Error("simulated rename failure");
          fs.renameSync(from, to);
        },
      }),
    /simulated rename failure/,
  );
  assert.equal(fs.readFileSync(path.join(stable, "Contents", "Resources", "stable.txt"), "utf8"), "keep");
  assert.equal(fs.existsSync(path.join(applicationsDir, rollbackAppName(now))), false);
  assert.equal(fs.existsSync(versioned), true);
  assert.equal(fs.existsSync(path.join(versioned, "Contents", "Resources", "new.txt")), true);
});

test("a failed tmp-to-versioned rename restores the aside copy", () => {
  const root = tempRoot();
  const applicationsDir = path.join(root, "Applications");
  const now = new Date(2026, 9, 6, 11, 9, 0);
  const built = path.join(root, "built", "BacksterOS.app");
  writeFakeApp(built, { extraFiles: { "Contents/Resources/new.txt": "new" } });
  const versioned = path.join(applicationsDir, versionedAppName(VERSION));
  writeFakeApp(versioned, { extraFiles: { "Contents/Resources/old.txt": "old" } });
  let renames = 0;
  assert.throws(
    () =>
      installMacosApp({
        builtAppPath: built,
        applicationsDir,
        version: VERSION,
        force: true,
        now,
        isRunning: () => false,
        runCodesign: okCodesign,
        rename: (from, to) => {
          renames += 1;
          if (renames === 2) throw new Error("simulated versioned rename failure");
          fs.renameSync(from, to);
        },
      }),
    /simulated versioned rename failure/,
  );
  assert.equal(fs.readFileSync(path.join(versioned, "Contents", "Resources", "old.txt"), "utf8"), "old");
});

test("replace-stable refuses when the stable bundle executable is running", async () => {
  const root = tempRoot();
  const applicationsDir = path.join(root, "Applications");
  const now = new Date(2026, 9, 6, 11, 9, 0);
  const versioned = path.join(applicationsDir, versionedAppName(VERSION));
  const stable = path.join(applicationsDir, STABLE_APP_NAME);
  writeFakeApp(versioned);
  writeFakeApp(stable);
  const exePath = path.join(stable, "Contents", "MacOS", BUNDLE_EXECUTABLE_FALLBACK);
  fs.writeFileSync(exePath, "#!/bin/sh\nexec /bin/sleep 30\n");
  fs.chmodSync(exePath, 0o755);
  const child = spawn(exePath, [], { stdio: "ignore" });
  try {
    const deadline = Date.now() + 2000;
    const pattern = `${path.join(stable, "Contents", "MacOS")}${path.sep}`;
    while (Date.now() < deadline) {
      if (pgrepSees(pattern)) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    if (!pgrepSees(pattern)) {
      throw new Error("test helper process never appeared in pgrep");
    }
    assert.throws(
      () =>
        installMacosApp({
          applicationsDir,
          version: VERSION,
          replaceStable: true,
          now,
          runCodesign: okCodesign,
        }),
      /BacksterOS is running/,
    );
    assert.equal(fs.existsSync(versioned), true);
    assert.equal(fs.existsSync(stable), true);
  } finally {
    child.kill("SIGTERM");
  }
});
