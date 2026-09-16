import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_FILE_TASK_MAILBOX_URL,
  resolveFileTaskMailboxBaseUrl,
  useBacksterosFileTaskAgentsStore,
} from "./fileTaskAgentsStore";

describe("resolveFileTaskMailboxBaseUrl", () => {
  afterEach(() => {
    useBacksterosFileTaskAgentsStore.setState({ callbackBaseUrl: "" });
  });

  it("defaults to the agents door", () => {
    useBacksterosFileTaskAgentsStore.setState({ callbackBaseUrl: "" });
    expect(resolveFileTaskMailboxBaseUrl()).toBe(DEFAULT_FILE_TASK_MAILBOX_URL);
  });

  it("uses a configured origin without a trailing slash", () => {
    useBacksterosFileTaskAgentsStore.setState({
      callbackBaseUrl: "http://127.0.0.1:8788/",
    });
    expect(resolveFileTaskMailboxBaseUrl()).toBe("http://127.0.0.1:8788");
  });
});
