/**
 * Default Cursor skill seeded into every project vault folder under
 * `.cursor/skills/backsteros-workflow-in_review-or-on_hold/SKILL.md`.
 *
 * Written only when missing so user edits are preserved.
 */

export const PROJECT_VAULT_WORKFLOW_SKILL_ID =
  "backsteros-workflow-in_review-or-on_hold" as const;

export const PROJECT_VAULT_WORKFLOW_SKILL_MARKDOWN = `---
name: backsteros-workflow-in_review-or-on_hold
description: When finishing a BacksterOS task, comment and leave status In Review (or On Hold if blocked)
---

# Finish BacksterOS tasks

When you were asked to implement or work from a **BacksterOS task** (recognized by a message starting with “Implement this Backsteros task. Start working now.”), do this as the **last step before saying you are done**:

1. Leave a short comment via the CLI:
   \`backsteros comment create <Task ID> -m "What changed"\`
   (\`backsteros\` is on PATH; auth is \`~/.config/backsteros/cli.env\`.)

2. **Status:** If this chat was started from BacksterDEV, the app usually moves the task to **In Review** when you go idle — do not fight that. Only set status yourself when the user asks (\`completed\`) or you are blocked:
   \`backsteros task update <Task ID> --status on_hold\`

3. In your final message, state clearly that you commented (and the status if you changed it).
`;
