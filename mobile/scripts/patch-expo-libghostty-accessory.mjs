#!/usr/bin/env node
/**
 * Hide Ghostty's soft-keyboard accessory bar (Esc/Ctrl/arrows chips).
 * BacksterOS iPad agent TUI assumes a hardware keyboard.
 *
 * Idempotent — safe to run from postinstall.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(
  root,
  "node_modules/expo-libghostty/ios/ExpoLibghosttyView.swift",
);

if (!fs.existsSync(target)) {
  console.warn(
    "[patch-expo-libghostty] ExpoLibghosttyView.swift not found — skip",
  );
  process.exit(0);
}

const MARKER = "BACKSTEROS_HIDE_INPUT_ACCESSORY";
let source = fs.readFileSync(target, "utf8");
if (source.includes(MARKER)) {
  process.exit(0);
}

const needle = "terminalView.autoresizingMask = [.flexibleWidth, .flexibleHeight]";
if (!source.includes(needle)) {
  console.warn(
    "[patch-expo-libghostty] expected autoresizingMask line missing — skip",
  );
  process.exit(0);
}

source = source.replace(
  needle,
  `${needle}
    // ${MARKER}: no Esc/Ctrl accessory bar (hardware keyboard)
#if !targetEnvironment(macCatalyst)
    terminalView.inputAccessoryItems = []
#endif`,
);

fs.writeFileSync(target, source);
console.log("[patch-expo-libghostty] hid iOS keyboard accessory bar");
