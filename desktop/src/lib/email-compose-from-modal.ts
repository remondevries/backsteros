import {
  getEmailComposeHref,
  type ComposeModalCreateEmailInput,
} from "@backsteros/ui";

import {
  emailComposeAgentTaskId,
  writeEmailAgentChatId,
} from "./agent/email-agent-prompt";
import {
  resetEmailComposeSession,
  writeEmailComposeSession,
} from "./email-compose-session";

export function beginEmailComposeFromModal(
  input: ComposeModalCreateEmailInput,
  options?: { inboxList?: boolean },
): { href: string } {
  resetEmailComposeSession();
  writeEmailAgentChatId(emailComposeAgentTaskId(), null);
  const sessionId = crypto.randomUUID();
  const brief = input.brief.trim();
  writeEmailComposeSession({
    sessionId,
    draftId: null,
    inboxId: input.inboxId,
    prefill: {
      ...(input.to.trim() ? { to: input.to.trim() } : {}),
      ...(input.subject.trim() ? { subject: input.subject.trim() } : {}),
    },
    agentBrief: brief || null,
    threadDefaults: {
      ...(input.status ? { status: input.status } : {}),
      ...(typeof input.priority === "number" ? { priority: input.priority } : {}),
      dueDate: input.dueDate,
      assigneeId: input.assigneeId,
    },
  });
  return { href: getEmailComposeHref({ inboxList: options?.inboxList }) };
}
