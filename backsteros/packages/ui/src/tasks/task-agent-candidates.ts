/**
 * Agents that could pick up a codebase task: the project's lead agent first,
 * then the other enabled agents in roster order. One entry per contact.
 * When the project's room members are known, only those agents (and the
 * lead) are listed.
 */

export type TaskAgentCandidateInput = {
  id: string;
  contactId: string | null;
  name: string;
  role?: string | null;
  enabled: boolean;
  /** Webhook Test passed — the agent can receive work. */
  ready: boolean;
  /** The agent's own Grok Bot id; matched against room members. */
  grokbotAgentId?: string | null;
};

export type TaskAgentCandidate = {
  agentId: string;
  contactId: string;
  name: string;
  role: string | null;
  avatarSrc: string | null;
  isLead: boolean;
  ready: boolean;
};

export function buildTaskAgentCandidates(input: {
  agents: readonly TaskAgentCandidateInput[];
  leadAgentContactId: string | null | undefined;
  contactsById?: ReadonlyMap<string, { name: string; avatarSrc?: string | null }>;
  /** Grok Bot agent ids in the project's room; empty/omitted = unknown. */
  roomMemberIds?: readonly string[];
}): TaskAgentCandidate[] {
  const leadId = input.leadAgentContactId?.trim() || null;
  const roomMembers = new Set(input.roomMemberIds ?? []);
  const seen = new Set<string>();
  const candidates: TaskAgentCandidate[] = [];
  for (const agent of input.agents) {
    const contactId = agent.contactId?.trim();
    if (!agent.enabled || !contactId || seen.has(contactId)) continue;
    const isLead = contactId === leadId;
    const grokbotAgentId = agent.grokbotAgentId?.trim() ?? "";
    if (roomMembers.size > 0 && !isLead && !roomMembers.has(grokbotAgentId)) {
      continue;
    }
    seen.add(contactId);
    const contact = input.contactsById?.get(contactId);
    candidates.push({
      agentId: agent.id,
      contactId,
      name: contact?.name?.trim() || agent.name,
      role: agent.role?.trim() || null,
      avatarSrc: contact?.avatarSrc ?? null,
      isLead,
      ready: agent.ready,
    });
  }
  const lead = candidates.filter((candidate) => candidate.isLead);
  const rest = candidates.filter((candidate) => !candidate.isLead);
  return [...lead, ...rest];
}

/** Side-panel tab label: the lead agent's name, else a generic label. */
export function taskAgentTabLabel(
  candidates: readonly TaskAgentCandidate[],
): string {
  return candidates.find((candidate) => candidate.isLead)?.name ?? "Agents";
}
