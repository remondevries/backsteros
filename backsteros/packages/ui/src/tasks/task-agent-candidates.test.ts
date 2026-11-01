import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTaskAgentCandidates,
  taskAgentTabLabel,
  type TaskAgentCandidateInput,
} from "./task-agent-candidates.ts";

function agent(
  partial: Partial<TaskAgentCandidateInput> &
    Pick<TaskAgentCandidateInput, "id" | "name">,
): TaskAgentCandidateInput {
  return {
    contactId: `c-${partial.id}`,
    enabled: true,
    ready: true,
    ...partial,
  };
}

describe("buildTaskAgentCandidates", () => {
  it("puts the project lead first and keeps roster order for the rest", () => {
    const candidates = buildTaskAgentCandidates({
      agents: [
        agent({ id: "judith", name: "Judith" }),
        agent({ id: "jaap", name: "Jaap" }),
        agent({ id: "niels", name: "Niels" }),
      ],
      leadAgentContactId: "c-niels",
    });
    assert.deepEqual(
      candidates.map((c) => [c.name, c.isLead]),
      [
        ["Niels", true],
        ["Judith", false],
        ["Jaap", false],
      ],
    );
    assert.equal(taskAgentTabLabel(candidates), "Niels");
  });

  it("skips disabled agents, agents without a contact, and duplicate contacts", () => {
    const candidates = buildTaskAgentCandidates({
      agents: [
        agent({ id: "a", name: "Judith", contactId: "c-judith" }),
        agent({ id: "b", name: "Judith (old)", contactId: "c-judith" }),
        agent({ id: "c", name: "Off", enabled: false }),
        agent({ id: "d", name: "No contact", contactId: null }),
      ],
      leadAgentContactId: null,
    });
    assert.deepEqual(
      candidates.map((c) => c.agentId),
      ["a"],
    );
    assert.equal(taskAgentTabLabel(candidates), "Agents");
  });

  it("lists only room members (plus the lead) once the room is known", () => {
    const agents = [
      agent({ id: "judith", name: "Judith", grokbotAgentId: "g-judith" }),
      agent({ id: "jaap", name: "Jaap", grokbotAgentId: "g-jaap" }),
      agent({ id: "niels", name: "Niels", grokbotAgentId: "g-niels" }),
      agent({ id: "eva", name: "Eva" }),
    ];
    const inRoom = buildTaskAgentCandidates({
      agents,
      leadAgentContactId: "c-niels",
      roomMemberIds: ["g-jaap"],
    });
    assert.deepEqual(
      inRoom.map((c) => c.name),
      ["Niels", "Jaap"],
    );
    const unknownRoom = buildTaskAgentCandidates({
      agents,
      leadAgentContactId: "c-niels",
      roomMemberIds: [],
    });
    assert.equal(unknownRoom.length, 4);
  });

  it("prefers the contact name, avatar, and job title over the agent row", () => {
    const [only] = buildTaskAgentCandidates({
      agents: [agent({ id: "n", name: "niels-bot", role: "Grok Bot agent" })],
      leadAgentContactId: "c-n",
      contactsById: new Map([
        [
          "c-n",
          {
            name: "Niels",
            avatarSrc: "blob:niels",
            title: " Lead developer ",
          },
        ],
      ]),
    });
    assert.equal(only?.name, "Niels");
    assert.equal(only?.avatarSrc, "blob:niels");
    assert.equal(only?.role, "Grok Bot agent");
    assert.equal(only?.jobTitle, "Lead developer");
  });
});
