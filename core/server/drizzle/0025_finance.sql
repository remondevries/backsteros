CREATE TABLE IF NOT EXISTS "bank_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "iban_or_mask" text,
  "currency" text DEFAULT 'EUR' NOT NULL,
  "institution" text DEFAULT 'other' NOT NULL,
  "sort_order" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_workspace_key_unique" ON "bank_accounts" ("workspace_id", "key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_accounts_workspace_id_idx" ON "bank_accounts" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_accounts_deleted_at_idx" ON "bank_accounts" ("deleted_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_categories" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "parent_id" text,
  "kind" text DEFAULT 'expense' NOT NULL,
  "sort_order" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "financial_categories_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "financial_categories"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_categories_workspace_id_idx" ON "financial_categories" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_categories_parent_id_idx" ON "financial_categories" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_categories_deleted_at_idx" ON "financial_categories" ("deleted_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_import_batches" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "bank_account_id" text NOT NULL REFERENCES "bank_accounts"("id") ON DELETE cascade,
  "original_filename" text DEFAULT '' NOT NULL,
  "storage_key" text DEFAULT '' NOT NULL,
  "dialect" text DEFAULT 'unknown' NOT NULL,
  "row_count" integer DEFAULT 0 NOT NULL,
  "inserted_count" integer DEFAULT 0 NOT NULL,
  "duplicate_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_import_batches_workspace_id_idx" ON "financial_import_batches" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_import_batches_bank_account_id_idx" ON "financial_import_batches" ("bank_account_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_transactions" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "bank_account_id" text NOT NULL REFERENCES "bank_accounts"("id") ON DELETE cascade,
  "import_batch_id" text REFERENCES "financial_import_batches"("id") ON DELETE set null,
  "booked_on" date NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text DEFAULT 'EUR' NOT NULL,
  "payee" text DEFAULT '' NOT NULL,
  "counterparty" text,
  "memo" text,
  "balance_after_cents" integer,
  "external_id" text,
  "fingerprint" text NOT NULL,
  "source_code" text,
  "source_type" text,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE set null,
  "project_id" text REFERENCES "projects"("id") ON DELETE set null,
  "category_id" text REFERENCES "financial_categories"("id") ON DELETE set null,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_transactions_account_booked_idx" ON "financial_transactions" ("workspace_id", "bank_account_id", "booked_on");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "financial_transactions_account_fingerprint_unique" ON "financial_transactions" ("bank_account_id", "fingerprint");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "financial_transactions_account_external_id_unique" ON "financial_transactions" ("bank_account_id", "external_id") WHERE "external_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_transactions_organization_id_idx" ON "financial_transactions" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_transactions_project_id_idx" ON "financial_transactions" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_transactions_category_id_idx" ON "financial_transactions" ("category_id");
