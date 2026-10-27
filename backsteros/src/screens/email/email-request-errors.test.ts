import assert from "node:assert/strict";
import { test } from "node:test";

import {
  beginEmailAgentRequest,
  emailRequestErrorMessage,
  endEmailAgentRequest,
  isEmailAgentRequestActive,
  isEmailFetchAbortError,
  isEmailNotFoundError,
} from "./email-request-errors.js";

test("isEmailFetchAbortError matches WebKit and AbortError shapes", () => {
  assert.equal(
    isEmailFetchAbortError(new DOMException("Aborted", "AbortError")),
    true,
  );
  assert.equal(
    isEmailFetchAbortError(new TypeError("Fetch is aborted")),
    true,
  );
  assert.equal(
    isEmailFetchAbortError(new Error("Could not save reply concept.")),
    false,
  );
});

test("emailRequestErrorMessage humanizes abort noise", () => {
  assert.equal(
    emailRequestErrorMessage(new TypeError("Fetch is aborted"), "fallback"),
    "Request was interrupted — try again.",
  );
  assert.equal(
    emailRequestErrorMessage(new Error("AgentMail 502"), "fallback"),
    "AgentMail 502",
  );
});

test("email agent request active depth nests", () => {
  assert.equal(isEmailAgentRequestActive(), false);
  beginEmailAgentRequest();
  beginEmailAgentRequest();
  assert.equal(isEmailAgentRequestActive(), true);
  endEmailAgentRequest();
  assert.equal(isEmailAgentRequestActive(), true);
  endEmailAgentRequest();
  assert.equal(isEmailAgentRequestActive(), false);
});

test("isEmailNotFoundError matches status, code, and message", () => {
  assert.equal(isEmailNotFoundError({ status: 404, message: "x" }), true);
  assert.equal(isEmailNotFoundError({ code: "not_found" }), true);
  assert.equal(isEmailNotFoundError(new Error("Comment not found")), true);
  assert.equal(isEmailNotFoundError(new Error("Draft not found")), true);
  assert.equal(isEmailNotFoundError(new Error("AgentMail 502")), false);
});
