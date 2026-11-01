/**
 * Resolve a project room's member ids (Grok Bot agent ids) to agent personas
 * for the Locations → Team property.
 */

export type ProjectTeamAgent = {
  contactId: string | null;
  name: string;
  role?: string | null;
  /** Reported by the agent via `PATCH /api/v1/agents/me`. */
  grokbotAgentId?: string | null;
};

export type ProjectTeamMember = {
  /** Grok Bot agent id from `channel.members`. */
  id: string;
  name: string;
  role: string | null;
  avatarSrc: string | null;
  /** False when no registered agent reported this Grok Bot id. */
  known: boolean;
};

/**
 * One entry per member id, in room order. Unknown ids stay in the list so a
 * mismatch between Grok Bot and BacksterOS is visible instead of hidden.
 */
export function resolveProjectTeamMembers(
  memberIds: readonly string[],
  agents: readonly ProjectTeamAgent[],
  avatarSrcById?: Readonly<Record<string, string | null | undefined>>,
): ProjectTeamMember[] {
  const byGrokbotId = new Map<string, ProjectTeamAgent>();
  for (const agent of agents) {
    const id = agent.grokbotAgentId?.trim();
    if (id && !byGrokbotId.has(id)) byGrokbotId.set(id, agent);
  }
  return memberIds.map((memberId) => {
    const agent = byGrokbotId.get(memberId);
    const contactId = agent?.contactId?.trim() || "";
    return {
      id: memberId,
      name: agent?.name?.trim() || "Unknown agent",
      role: agent?.role?.trim() || null,
      avatarSrc: (contactId ? avatarSrcById?.[contactId] : null) ?? null,
      known: Boolean(agent),
    };
  });
}
