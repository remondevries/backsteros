import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveProjectTeamMembers } from "./project-team-members.ts";

const agents = [
  {
    contactId: "c-niels",
    name: "Niels",
    role: " Lead ",
    grokbotAgentId: "g-niels",
  },
  { contactId: "c-eva", name: "Eva", grokbotAgentId: "g-eva" },
  { contactId: "c-no-id", name: "Never reported", grokbotAgentId: null },
];

describe("resolveProjectTeamMembers", () => {
  it("resolves member ids to agents in room order with avatars", () => {
    const members = resolveProjectTeamMembers(["g-eva", "g-niels"], agents, {
      "c-niels": "blob:niels",
    });
    assert.deepEqual(
      members.map((member) => [member.name, member.known, member.avatarSrc]),
      [
        ["Eva", true, null],
        ["Niels", true, "blob:niels"],
      ],
    );
    assert.equal(members[1]?.role, "Lead");
  });

  it("keeps ids that no registered agent reported", () => {
    const [unknown] = resolveProjectTeamMembers(["g-ghost"], agents);
    assert.equal(unknown?.name, "Unknown agent");
    assert.equal(unknown?.known, false);
    assert.equal(unknown?.id, "g-ghost");
  });

  it("returns nothing when the room has no members", () => {
    assert.deepEqual(resolveProjectTeamMembers([], agents), []);
  });
});
