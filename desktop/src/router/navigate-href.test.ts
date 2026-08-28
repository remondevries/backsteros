import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAppHref } from "./navigate-href.ts";

test("parseAppHref splits pathname, search, and hash", () => {
  assert.deepEqual(parseAppHref("/email/in_1/msg_1?list=inbox"), {
    pathname: "/email/in_1/msg_1",
    search: { list: "inbox" },
  });
  assert.deepEqual(parseAppHref("/inbox/ko-8#comments"), {
    pathname: "/inbox/ko-8",
    hash: "#comments",
  });
  assert.deepEqual(parseAppHref("/tasks"), {
    pathname: "/tasks",
  });
});
