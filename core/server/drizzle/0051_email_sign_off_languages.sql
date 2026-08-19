ALTER TABLE "workspace_integration_secrets"
  ADD COLUMN IF NOT EXISTS "agentmail_reply_sign_off_template_en" text,
  ADD COLUMN IF NOT EXISTS "agentmail_reply_sign_off_template_nl" text;

UPDATE "workspace_integration_secrets"
SET
  "agentmail_reply_sign_off_template_en" = COALESCE(
    "agentmail_reply_sign_off_template_en",
    "agentmail_reply_sign_off_template",
    'Best,' || E'\n' || '{name}'
  ),
  "agentmail_reply_sign_off_template_nl" = COALESCE(
    "agentmail_reply_sign_off_template_nl",
    'Met vriendelijke groet,' || E'\n' || '{name}'
  );
