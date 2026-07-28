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
description: When finishing a BacksterOS task, move it to In Review or On Hold
---

# Finish BacksterOS tasks → In Review

When you were asked to implement or work from a **BacksterOS task** (Recognized by the message starting with “Implement this Backsteros task. Start working now.”), do this as the **last step before saying you are done**:

1. Set the task status to **\`in_review\`** (“**In Review**”).

2. Prefer API: \`PATCH /api/v1/tasks/{uuid}\` with \`{"status":"in_review","activityActor":"agent"}\` (Bearer key with \`tasks:write\`).

3. If you only have a display id (\`KEY-number\`), resolve project \`key\` + task \`number\` → UUID first, then PATCH.

4. Fallback when the API key is unavailable: update Postgres \`tasks.status = 'in_review'\` for that row — PowerSync publication will pick up the UPDATE.

5. In your final message, state clearly that the task is now **In Review**.

Do **not** leave finished work in any other status other than **In Review** (**\`in_review\`**) — In Review is how the user knows the agent is done.

Skip only if the user said not to change status, or the work is blocked / incomplete then move the status to **On Hold** (**\`on_hold\`**).
`;
