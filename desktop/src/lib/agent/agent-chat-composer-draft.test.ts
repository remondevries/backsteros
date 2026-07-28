import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearAgentChatComposerDraft,
  readAgentChatComposerDraft,
  writeAgentChatComposerDraft,
} from "./agent-chat-composer-draft.ts";

test("read/writeAgentChatComposerDraft round-trip per task", () => {
  const store = new Map<string, string>();
  const previous = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    },
  });

  try {
    clearAgentChatComposerDraft("task-1");
    clearAgentChatComposerDraft("task-2");

    writeAgentChatComposerDraft("task-1", {
      text: "hello from task 1",
      images: [
        {
          id: "img-1",
          name: "shot.png",
          mimeType: "image/png",
          dataBase64: "abc",
        },
      ],
    });

    const loaded = readAgentChatComposerDraft("task-1");
    assert.equal(loaded.text, "hello from task 1");
    assert.equal(loaded.images.length, 1);
    assert.equal(loaded.images[0]?.dataBase64, "abc");

    const other = readAgentChatComposerDraft("task-2");
    assert.equal(other.text, "");
    assert.equal(other.images.length, 0);

    clearAgentChatComposerDraft("task-1");
    assert.equal(readAgentChatComposerDraft("task-1").text, "");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previous,
    });
  }
});

test("writeAgentChatComposerDraft clears storage when empty", () => {
  const store = new Map<string, string>();
  const previous = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    },
  });

  try {
    writeAgentChatComposerDraft("task-empty", {
      text: "temp",
      images: [],
    });
    writeAgentChatComposerDraft("task-empty", { text: "", images: [] });
    assert.equal(readAgentChatComposerDraft("task-empty").text, "");
    assert.equal(
      [...store.keys()].some((key) => key.includes("task-empty")),
      false,
    );
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previous,
    });
  }
});
