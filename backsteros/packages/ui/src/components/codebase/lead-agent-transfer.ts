/**
 * When changing the Lead agent on a project that already has a connected
 * Channel and a current lead, ask that lead (via webhook) to ensure the
 * candidate is in the room before BacksterOS flips `leadAgentContactId`.
 */

export function shouldRequestLeadAgentTransfer(input: {
  previousContactId: string | null | undefined;
  nextContactId: string | null | undefined;
  channelUri: string | null | undefined;
}): boolean {
  const previous = input.previousContactId?.trim() || "";
  const next = input.nextContactId?.trim() || "";
  const uri = input.channelUri?.trim() || "";
  if (!next || !previous || !uri) return false;
  return previous !== next;
}
