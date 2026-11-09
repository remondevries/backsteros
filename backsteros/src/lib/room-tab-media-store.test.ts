import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  clearRoomTabMedia,
  formatRoomTabMediaTooltip,
  getRoomTabMediaAudioLevel,
  getRoomTabMediaDiscrete,
  setRoomTabMedia,
  subscribeRoomTabMediaAudio,
  subscribeRoomTabMediaDiscrete,
} from "./room-tab-media-store.js";

describe("room-tab-media-store", () => {
  test("tracks camera / mic discrete state and clears on null", () => {
    const meetingId = "meet-cam";
    clearRoomTabMedia(meetingId);

    let wakes = 0;
    const stop = subscribeRoomTabMediaDiscrete(() => {
      wakes += 1;
    });

    setRoomTabMedia(meetingId, {
      cameraPublished: true,
      micEnabled: false,
      audioLevel: 0.2,
    });
    assert.deepEqual(getRoomTabMediaDiscrete(meetingId), {
      cameraPublished: true,
      micEnabled: false,
    });
    assert.equal(wakes, 1);
    // Muted → audio forced to 0 even if a level was passed.
    assert.equal(getRoomTabMediaAudioLevel(meetingId), 0);

    setRoomTabMedia(meetingId, {
      cameraPublished: true,
      micEnabled: false,
      audioLevel: 0,
    });
    assert.equal(wakes, 1, "identical discrete should not re-notify");

    clearRoomTabMedia(meetingId);
    assert.deepEqual(getRoomTabMediaDiscrete(meetingId), {
      cameraPublished: false,
      micEnabled: false,
    });
    assert.equal(wakes, 2);
    stop();
  });

  test("mic speaking updates audio listeners without discrete wakes", () => {
    const meetingId = "meet-mic";
    clearRoomTabMedia(meetingId);

    let discreteWakes = 0;
    const stopDiscrete = subscribeRoomTabMediaDiscrete(() => {
      discreteWakes += 1;
    });

    const levels: number[] = [];
    const stopAudio = subscribeRoomTabMediaAudio(meetingId, (level) => {
      levels.push(level);
    });

    setRoomTabMedia(meetingId, {
      cameraPublished: false,
      micEnabled: true,
      audioLevel: 0,
    });
    assert.equal(discreteWakes, 1);
    assert.equal(levels.at(-1), 0);

    setRoomTabMedia(meetingId, {
      cameraPublished: false,
      micEnabled: true,
      audioLevel: 0.42,
    });
    assert.equal(discreteWakes, 1);
    assert.equal(levels.at(-1), 0.42);

    setRoomTabMedia(meetingId, {
      cameraPublished: false,
      micEnabled: true,
      audioLevel: 0,
    });
    assert.equal(levels.at(-1), 0);

    setRoomTabMedia(meetingId, {
      cameraPublished: false,
      micEnabled: false,
      audioLevel: 0.9,
    });
    assert.equal(discreteWakes, 2);
    assert.equal(
      getRoomTabMediaAudioLevel(meetingId),
      0,
      "mute must zero audio even if a raw level is supplied",
    );

    clearRoomTabMedia(meetingId);
    stopDiscrete();
    stopAudio();
  });

  test("tooltip names exact cam/mic state", () => {
    assert.equal(
      formatRoomTabMediaTooltip({
        cameraPublished: true,
        micEnabled: true,
      }),
      "Camera on, microphone on",
    );
    assert.equal(
      formatRoomTabMediaTooltip({
        cameraPublished: false,
        micEnabled: false,
      }),
      "Camera off, microphone muted",
    );
    assert.equal(
      formatRoomTabMediaTooltip({
        cameraPublished: false,
        micEnabled: true,
      }),
      "Camera off, microphone on",
    );
  });
});
