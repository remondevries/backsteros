/**
 * Agents that could pick up a codebase task: the project's lead agent first,
 * then the other enabled agents in roster order. One entry per contact.
 */

export type TaskAgentCandidateInput = {
  id: string;
  contactId: string | null;
  name: string;
  role?: string | null;
  enabled: boolean;
  /** Webhook Test passed — the agent can receive work. */
  ready: boolean;
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
}): TaskAgentCandidate[] {
  const leadId = input.leadAgentContactId?.trim() || null;
  const seen = new Set<string>();
  const candidates: TaskAgentCandidate[] = [];
  for (const agent of input.agents) {
    const contactId = agent.contactId?.trim();
    if (!agent.enabled || !contactId || seen.has(contactId)) continue;
    seen.add(contactId);
    const contact = input.contactsById?.get(contactId);
    candidates.push({
      agentId: agent.id,
      contactId,
      name: contact?.name?.trim() || agent.name,
      role: agent.role?.trim() || null,
      avatarSrc: contact?.avatarSrc ?? null,
      isLead: contactId === leadId,
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
