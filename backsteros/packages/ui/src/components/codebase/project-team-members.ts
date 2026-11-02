/**
 * Resolve a project room's member ids (Grok Bot agent ids) to agent personas
 * for the Locations → Team property.
 */

export type ProjectTeamAgent = {
  contactId: string | null;
  name: string;
  role?: string | null;
  /** Contact job title — Team Add dropdown + chip hover (same as Lead agent). */
  jobTitle?: string | null;
  /** Reported by the agent via `PATCH /api/v1/agents/me`. */
  grokbotAgentId?: string | null;
};

export type ProjectTeamMember = {
  /** Grok Bot agent id from `channel.members`. */
  id: string;
  name: string;
  role: string | null;
  /** Contact job title for the hover tooltip. */
  jobTitle: string | null;
  avatarSrc: string | null;
  /** False when no registered agent reported this Grok Bot id. */
  known: boolean;
};

/**
 * One entry per member id, in room order. Unknown ids stay in the list so a
 * mismatch between Grok Bot and BacksterOS is visible instead of hidden.
 * The lead agent is skipped — the Lead agent property already shows it.
 */
export function resolveProjectTeamMembers(
  memberIds: readonly string[],
  agents: readonly ProjectTeamAgent[],
  avatarSrcById?: Readonly<Record<string, string | null | undefined>>,
  options?: { excludeContactId?: string | null },
): ProjectTeamMember[] {
  const byGrokbotId = new Map<string, ProjectTeamAgent>();
  for (const agent of agents) {
    const id = agent.grokbotAgentId?.trim();
    if (id && !byGrokbotId.has(id)) byGrokbotId.set(id, agent);
  }
  const excluded = options?.excludeContactId?.trim() || "";
  const members: ProjectTeamMember[] = [];
  for (const memberId of memberIds) {
    const agent = byGrokbotId.get(memberId);
    const contactId = agent?.contactId?.trim() || "";
    if (excluded && contactId === excluded) continue;
    members.push({
      id: memberId,
      name: agent?.name?.trim() || "Unknown agent",
      role: agent?.role?.trim() || null,
      jobTitle: agent?.jobTitle?.trim() || null,
      avatarSrc: (contactId ? avatarSrcById?.[contactId] : null) ?? null,
      known: Boolean(agent),
    });
  }
  return members;
}

/**
 * Agents that could join the room: reported a Grok Bot id, not already in
 * `memberIds`, and not the lead (Lead agent is shown above Team).
 */
export function listAddableProjectTeamAgents(
  memberIds: readonly string[],
  agents: readonly ProjectTeamAgent[],
  options?: { excludeContactId?: string | null },
): ProjectTeamAgent[] {
  const inRoom = new Set(
    memberIds.map((id) => id.trim()).filter((id) => id.length > 0),
  );
  const excluded = options?.excludeContactId?.trim() || "";
  const seen = new Set<string>();
  const addable: ProjectTeamAgent[] = [];
  for (const agent of agents) {
    const grokbotId = agent.grokbotAgentId?.trim() || "";
    if (!grokbotId || inRoom.has(grokbotId)) continue;
    const contactId = agent.contactId?.trim() || "";
    if (excluded && contactId === excluded) continue;
    const key = contactId || grokbotId;
    if (seen.has(key)) continue;
    seen.add(key);
    addable.push(agent);
  }
  return addable;
}
