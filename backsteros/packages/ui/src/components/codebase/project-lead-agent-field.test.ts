import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveLeadAgentChipLabel } from "./project-lead-agent-field.js";

test("resolveLeadAgentChipLabel shows No lead agent when unset", () => {
  assert.equal(
    resolveLeadAgentChipLabel(null, [
      { value: "__none__", label: "No lead agent" },
      { value: "niels", label: "Niels" },
    ]),
    "No lead agent",
  );
});

test("resolveLeadAgentChipLabel shows selected name when in options", () => {
  assert.equal(
    resolveLeadAgentChipLabel("niels", [
      { value: "__none__", label: "No lead agent" },
      { value: "niels", label: "Niels" },
    ]),
    "Niels",
  );
});

test("resolveLeadAgentChipLabel stays No lead agent when lead missing from roster", () => {
  assert.equal(
    resolveLeadAgentChipLabel("orphan-lead", [
      { value: "__none__", label: "No lead agent" },
      { value: "niels", label: "Niels" },
    ]),
    "No lead agent",
  );
});

test("resolveLeadAgentChipLabel never returns empty when matched label is blank", () => {
  assert.equal(
    resolveLeadAgentChipLabel("blank", [
      { value: "__none__", label: "No lead agent" },
      { value: "blank", label: "   " },
    ]),
    "No lead agent",
  );
});
