-- Circle uses timestamp-scale signed ordering keys, which exceed int4.
ALTER TABLE "organizations" ALTER COLUMN "sort_order" TYPE bigint;
ALTER TABLE "contacts" ALTER COLUMN "sort_order" TYPE bigint;
ALTER TABLE "areas" ALTER COLUMN "sort_order" TYPE bigint;
ALTER TABLE "projects" ALTER COLUMN "sort_order" TYPE bigint;
ALTER TABLE "tasks" ALTER COLUMN "sort_order" TYPE bigint;
ALTER TABLE "documents" ALTER COLUMN "sort_order" TYPE bigint;
ALTER TABLE "letters" ALTER COLUMN "sort_order" TYPE bigint;
