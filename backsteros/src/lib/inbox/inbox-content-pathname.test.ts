import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  inboxContentAlreadyShowsHref,
  resolveInboxContentPathname,
} from "./inbox-content-pathname.ts";

function withWindowLocation(href: string, run: () => void): void {
  const original = globalThis.window;
  const url = new URL(href, "http://local.invalid");
  globalThis.window = {
    location: {
      pathname: url.pathname,
      search: url.search,
    },
  } as Window & typeof globalThis;
  try {
    run();
  } finally {
    globalThis.window = original;
  }
}

afterEach(() => {
  // Ensure a leaked stub cannot poison later files in the same process.
});

describe("inbox-content-pathname", () => {
  test("prefers the live window email path over a keep-alive mirror", () => {
    withWindowLocation("/email/box/msg-a?list=inbox", () => {
      assert.equal(
        resolveInboxContentPathname("/email/box/msg-b?list=inbox"),
        "/email/box/msg-a",
      );
      assert.equal(
        inboxContentAlreadyShowsHref("/email/box/msg-a?list=inbox"),
        true,
      );
      assert.equal(
        inboxContentAlreadyShowsHref("/email/box/msg-b?list=inbox"),
        false,
      );
    });
  });

  test("keeps non-email shell paths when the window is not on email", () => {
    withWindowLocation("/inbox/task-1", () => {
      assert.equal(
        resolveInboxContentPathname("/inbox/task-1"),
        "/inbox/task-1",
      );
    });
  });
});
