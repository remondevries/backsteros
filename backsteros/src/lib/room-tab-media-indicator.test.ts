import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

import {
  ROOM_TAB_AUDIO_LEVEL_VAR,
  ROOM_TAB_FORBIDDEN_INDICATOR_COLORS,
  ROOM_TAB_LIVE_ANCHOR,
  roomTabAudioDisplayLevel,
  roomTabIconRootClassNames,
  roomTabLiveMarkerClassNames,
  shouldShowRoomTabLiveMarker,
} from "./room-tab-media-indicator.js";
import {
  clearRoomTabMedia,
  getRoomTabMediaAudioLevel,
  getRoomTabMediaDiscrete,
  setRoomTabMedia,
} from "./room-tab-media-store.js";

const here = dirname(fileURLToPath(import.meta.url));
const contentShellCss = readFileSync(
  join(
    here,
    "../../packages/ui/src/styles/content-shell.css",
  ),
  "utf8",
);

describe("room-tab-media-indicator", () => {
  test("live pip anchor is fixed top-right and never relocates with state", () => {
    assert.equal(ROOM_TAB_LIVE_ANCHOR, "top-right");

    const camOnly = roomTabLiveMarkerClassNames({
      cameraPublished: true,
      micEnabled: false,
    });
    const micOnly = roomTabLiveMarkerClassNames({
      cameraPublished: false,
      micEnabled: true,
    });
    const both = roomTabLiveMarkerClassNames({
      cameraPublished: true,
      micEnabled: true,
    });

    for (const classes of [camOnly, micOnly, both]) {
      assert.ok(classes.includes("content-tab-room-icon__live"));
      assert.equal(
        classes.filter((name) => name === "content-tab-room-icon__live")
          .length,
        1,
        "exactly one live pip class",
      );
    }

    // CSS locks the pip to top-right (no left cam / right mic split).
    const liveBlock = contentShellCss.slice(
      contentShellCss.indexOf(".content-tab-room-icon__live {"),
      contentShellCss.indexOf(".content-tab-room-icon__live.is-camera-on"),
    );
    assert.match(liveBlock, /top:\s*-2px/);
    assert.match(liveBlock, /right:\s*-2px/);
    assert.match(liveBlock, /left:\s*auto/);
    assert.doesNotMatch(liveBlock, /left:\s*-2px/);
  });

  test("state colors are green-only — no amber/orange chrome", () => {
    const cam = roomTabLiveMarkerClassNames({
      cameraPublished: true,
      micEnabled: false,
    });
    const mic = roomTabLiveMarkerClassNames({
      cameraPublished: false,
      micEnabled: true,
    });
    assert.deepEqual(cam, [
      "content-tab-room-icon__live",
      "is-camera-on",
    ]);
    assert.deepEqual(mic, ["content-tab-room-icon__live", "is-mic-on"]);
    assert.ok(!cam.includes("is-mic-on"));
    assert.ok(!mic.includes("is-camera-on"));

    const liveCssStart = contentShellCss.indexOf(
      ".content-tab-room-icon__live {",
    );
    const liveCssEnd = contentShellCss.indexOf(
      ".content-tab-close-fade",
      liveCssStart,
    );
    const liveCss = contentShellCss.slice(liveCssStart, liveCssEnd);
    for (const forbidden of ROOM_TAB_FORBIDDEN_INDICATOR_COLORS) {
      assert.equal(
        liveCss.includes(forbidden),
        false,
        `live pip CSS must not contain ${forbidden}`,
      );
    }
    assert.match(
      contentShellCss,
      /\.content-tab-room-icon__live\.is-camera-on\s*\{[^}]*background:\s*#22c55e/s,
    );
    assert.match(
      contentShellCss,
      /\.content-tab-room-icon__live\.is-mic-on\s*\{[^}]*rgb\(34 197 94/s,
    );
    assert.doesNotMatch(
      contentShellCss,
      /\.content-tab-room-icon\.is-mic-on\s*\{[^}]*box-shadow/s,
      "ring must not live on the format glyph root",
    );
  });

  test("audio ring is on the live pip only; mute zeros display level", () => {
    assert.equal(ROOM_TAB_AUDIO_LEVEL_VAR, "--room-tab-audio-level");
    assert.match(
      contentShellCss,
      /\.content-tab-room-icon__live\.is-mic-on\s*\{[^}]*var\(--room-tab-audio-level/s,
    );
    assert.doesNotMatch(
      contentShellCss,
      /\.content-tab-room-icon\.is-mic-on\s*\{[^}]*--room-tab-audio-level|--avatar-audio-level/s,
    );

    assert.equal(roomTabAudioDisplayLevel(0.5, false), 0);
    assert.equal(roomTabAudioDisplayLevel(0, true), 0);
    assert.ok(roomTabAudioDisplayLevel(0.5, true) > 0);
    // Reduced-motion must not gate this helper (always maps energy when unmuted).
    assert.ok(roomTabAudioDisplayLevel(0.35, true) > 0);
  });

  test("marker mount mirrors truthful cam/mic; root has no pip children classes", () => {
    assert.equal(
      shouldShowRoomTabLiveMarker({
        cameraPublished: false,
        micEnabled: false,
      }),
      false,
    );
    assert.equal(
      shouldShowRoomTabLiveMarker({
        cameraPublished: true,
        micEnabled: false,
      }),
      true,
    );
    assert.equal(
      shouldShowRoomTabLiveMarker({
        cameraPublished: false,
        micEnabled: true,
      }),
      true,
    );

    const root = roomTabIconRootClassNames({
      cameraPublished: true,
      micEnabled: true,
    });
    assert.ok(root.includes("content-tab-room-icon"));
    assert.ok(!root.some((name) => name.includes("__cam")));
    assert.ok(!root.some((name) => name.includes("__mic")));
  });

  test("tab-switch style persistence: per-room levels survive until clear", () => {
    const roomA = "meet-indicator-a";
    const roomB = "meet-indicator-b";
    clearRoomTabMedia(roomA);
    clearRoomTabMedia(roomB);

    setRoomTabMedia(roomA, {
      cameraPublished: true,
      micEnabled: true,
      audioLevel: 0.4,
    });
    setRoomTabMedia(roomB, {
      cameraPublished: true,
      micEnabled: false,
      audioLevel: 0.9,
    });

    assert.deepEqual(getRoomTabMediaDiscrete(roomA), {
      cameraPublished: true,
      micEnabled: true,
    });
    assert.equal(getRoomTabMediaAudioLevel(roomA), 0.4);
    assert.equal(
      getRoomTabMediaAudioLevel(roomB),
      0,
      "muted room B must not carry a speaking level",
    );
    assert.deepEqual(
      roomTabLiveMarkerClassNames(getRoomTabMediaDiscrete(roomA)),
      ["content-tab-room-icon__live", "is-camera-on", "is-mic-on"],
    );
    assert.deepEqual(
      roomTabLiveMarkerClassNames(getRoomTabMediaDiscrete(roomB)),
      ["content-tab-room-icon__live", "is-camera-on"],
    );

    // Simulate backgrounding A (no clear) then closing A.
    assert.equal(getRoomTabMediaAudioLevel(roomA), 0.4);
    clearRoomTabMedia(roomA);
    assert.deepEqual(getRoomTabMediaDiscrete(roomA), {
      cameraPublished: false,
      micEnabled: false,
    });
    assert.deepEqual(getRoomTabMediaDiscrete(roomB), {
      cameraPublished: true,
      micEnabled: false,
    });

    clearRoomTabMedia(roomB);
  });
});
