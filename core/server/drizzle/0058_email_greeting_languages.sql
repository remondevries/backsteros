ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "agentmail_reply_greeting_template_en" text,
  ADD COLUMN IF NOT EXISTS "agentmail_reply_greeting_template_nl" text;

UPDATE "workspace_integration_secrets"
SET
  "agentmail_reply_greeting_template_en" = COALESCE(
    "agentmail_reply_greeting_template_en",
    "agentmail_reply_greeting_template",
    'Hi {firstName},'
  ),
  "agentmail_reply_greeting_template_nl" = COALESCE(
    "agentmail_reply_greeting_template_nl",
    'Beste {firstName},'
  );
