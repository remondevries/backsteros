import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  listAddableProjectTeamAgents,
  resolveProjectTeamMembers,
} from "./project-team-members.ts";

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

  it("drops the lead agent — the Lead agent property already shows it", () => {
    const members = resolveProjectTeamMembers(
      ["g-niels", "g-eva", "g-ghost"],
      agents,
      undefined,
      { excludeContactId: "c-niels" },
    );
    assert.deepEqual(
      members.map((member) => member.id),
      ["g-eva", "g-ghost"],
    );
  });
});

describe("listAddableProjectTeamAgents", () => {
  it("lists agents with a Grok Bot id who are not in the room or lead", () => {
    // Niels is lead, Eva is in the room, Never reported has no id → empty.
    assert.deepEqual(
      listAddableProjectTeamAgents(["g-eva"], agents, {
        excludeContactId: "c-niels",
      }),
      [],
    );
    const withMarcus = [
      ...agents,
      {
        contactId: "c-marcus",
        name: "Marcus",
        grokbotAgentId: "g-marcus",
      },
    ];
    assert.deepEqual(
      listAddableProjectTeamAgents(["g-eva"], withMarcus, {
        excludeContactId: "c-niels",
      }).map((agent) => agent.name),
      ["Marcus"],
    );
  });

  it("returns every reported agent when the room is empty", () => {
    assert.deepEqual(
      listAddableProjectTeamAgents([], agents).map(
        (agent) => agent.grokbotAgentId,
      ),
      ["g-niels", "g-eva"],
    );
  });
});
