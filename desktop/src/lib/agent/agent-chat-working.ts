/**
 * T3-style Chat working chrome: send intent + turn phase, not only ACP frames.
 */

export type AgentChatWorkingInput = {
  turnPending: boolean;
  turnPhase: string;
  startingAgent: boolean;
  sendInFlight: boolean;
};

/** Whether the transcript should show live Working… (includes send intent). */
export function resolveAgentChatWorking(input: AgentChatWorkingInput): boolean {
  return (
    input.turnPending ||
    input.turnPhase !== "idle" ||
    input.startingAgent ||
    input.sendInFlight
  );
}

export type ComposerPrimaryAction = "send" | "sending" | "stop";

/**
 * T3 ComposerPrimaryActions: Stop only while a turn is live; Sending… while
 * dispatching before that; otherwise Send.
 */
export function resolveComposerPrimaryAction(input: {
  sending: boolean;
  running: boolean;
}): ComposerPrimaryAction {
  if (input.running) return "stop";
  if (input.sending) return "sending";
  return "send";
}
