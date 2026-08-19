import {
  AbstractPowerSyncDatabase,
  column,
  PowerSyncBackendConnector,
  PowerSyncDatabase,
  Schema,
  Table,
} from "@powersync/react-native";
import { SQLJSOpenFactory } from "@powersync/adapter-sql-js";
import { OPSqliteOpenFactory } from "@powersync/op-sqlite";
import Constants from "expo-constants";

export type TokenProvider = () => Promise<string | null>;

const commonDates = {
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
};

const projects = new Table(
  {
    key: column.text,
    name: column.text,
    summary: column.text,
    description: column.text,
    organization_id: column.text,
    area_id: column.text,
    area: column.text,
    start_date: column.text,
    due_date: column.text,
    icon: column.text,
    color: column.text,
    type: column.text,
    github_repository: column.text,
    local_working_directory: column.text,
    status: column.text,
    priority: column.integer,
    sort_order: column.integer,
    ...commonDates,
  },
  {
    indexes: {
      status: ["status"],
      organization: ["organization_id"],
      type: ["type"],
    },
  },
);

const tasks = new Table(
  {
    project_id: column.text,
    contact_id: column.text,
    assignee_id: column.text,
    number: column.integer,
    title: column.text,
    description: column.text,
    status: column.text,
    priority: column.integer,
    sort_order: column.integer,
    due_date: column.text,
    triaged_at: column.text,
    inbox: column.integer,
    links: column.text,
    agent_chat_id: column.text,
    completed_at: column.text,
    habit_id: column.text,
    ...commonDates,
  },
  {
    indexes: {
      status: ["status"],
      project: ["project_id"],
      contact: ["contact_id"],
      habit: ["habit_id"],
    },
  },
);

const documents = new Table(
  {
    type: column.text,
    project_id: column.text,
    parent_id: column.text,
    kind: column.text,
    icon: column.text,
    sort_order: column.integer,
    journal_date: column.text,
    path: column.text,
    title: column.text,
    storage_key: column.text,
    content_type: column.text,
    byte_size: column.integer,
    checksum: column.text,
    snippet: column.text,
    content_version: column.integer,
    content_etag: column.text,
    ...commonDates,
  },
  {
    indexes: {
      type: ["type"],
      project: ["project_id"],
      parent: ["parent_id"],
    },
  },
);

const organizations = new Table({
  number: column.integer,
  key: column.text,
  name: column.text,
  summary: column.text,
  phone: column.text,
  email: column.text,
  website: column.text,
  address: column.text,
  city: column.text,
  postal_code: column.text,
  country: column.text,
  avatar_storage_key: column.text,
  avatar_content_type: column.text,
  sort_order: column.integer,
  notes: column.text,
  ...commonDates,
});

const contacts = new Table(
  {
    number: column.integer,
    key: column.text,
    organization_id: column.text,
    name: column.text,
    email: column.text,
    title: column.text,
    summary: column.text,
    avatar_storage_key: column.text,
    avatar_content_type: column.text,
    sort_order: column.integer,
    phone: column.text,
    role: column.text,
    notes: column.text,
    address: column.text,
    city: column.text,
    postal_code: column.text,
    country: column.text,
    social_accounts: column.text,
    ...commonDates,
  },
  { indexes: { organization: ["organization_id"] } },
);

const letters = new Table(
  {
    number: column.integer,
    project_id: column.text,
    organization_id: column.text,
    contact_id: column.text,
    title: column.text,
    icon: column.text,
    context: column.text,
    status: column.text,
    due_date: column.text,
    received_date: column.text,
    direction: column.text,
    storage_key: column.text,
    original_filename: column.text,
    content_type: column.text,
    byte_size: column.integer,
    checksum: column.text,
    content_etag: column.text,
    sort_order: column.integer,
    ...commonDates,
  },
  {
    indexes: {
      project: ["project_id"],
      organization: ["organization_id"],
      contact: ["contact_id"],
    },
  },
);

const workspace_settings = new Table({
  settings: column.text,
  updated_at: column.text,
});

const areas = new Table({
  name: column.text,
  parent: column.text,
  icon: column.text,
  color: column.text,
  sort_order: column.integer,
  ...commonDates,
});

const avatars = new Table({
  entity_type: column.text,
  entity_id: column.text,
  content_type: column.text,
  byte_size: column.integer,
  checksum: column.text,
  content_etag: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const mentions = new Table({
  user_id: column.text,
  source_type: column.text,
  source_id: column.text,
  excerpt: column.text,
  read_at: column.text,
  created_at: column.text,
});

// Finance Tier A/B tables — mirrors `core/packages/powersync-schema`.
// Transactions are Tier C (REST only) and intentionally not synced.
const bank_accounts = new Table({
  key: column.text,
  name: column.text,
  iban_or_mask: column.text,
  currency: column.text,
  type: column.text,
  avatar_storage_key: column.text,
  avatar_content_type: column.text,
  color: column.text,
  sort_order: column.integer,
  ...commonDates,
});

const financial_categories = new Table(
  {
    name: column.text,
    parent_id: column.text,
    kind: column.text,
    listing: column.text,
    icon: column.text,
    budget_cents: column.integer,
    sort_order: column.integer,
    ...commonDates,
  },
  { indexes: { parent: ["parent_id"] } },
);

const financial_goals = new Table({
  name: column.text,
  listing: column.text,
  icon: column.text,
  goal_amount_cents: column.integer,
  start_date: column.text,
  end_date: column.text,
  contribution_cents: column.integer,
  saving_mode: column.text,
  sort_order: column.integer,
  ...commonDates,
});

const financial_recurrings = new Table({
  name: column.text,
  icon: column.text,
  category_id: column.text,
  amount_cents: column.integer,
  next_date: column.text,
  archived: column.integer,
  sort_order: column.integer,
  ...commonDates,
});

const habits = new Table({
  title: column.text,
  icon: column.text,
  description: column.text,
  project_id: column.text,
  cadence: column.text,
  cadence_anchor_ymd: column.text,
  sort_order: column.integer,
  ...commonDates,
});

export const appSchema = new Schema({
  projects,
  tasks,
  documents,
  organizations,
  contacts,
  letters,
  workspace_settings,
  areas,
  avatars,
  mentions,
  bank_accounts,
  financial_categories,
  financial_goals,
  financial_recurrings,
  habits,
});

export type UploadEntry = {
  table: string;
  op: "PUT" | "PATCH" | "DELETE";
  id: string;
  data?: Record<string, unknown>;
};

export function mapCrudBatch(
  crud: Array<{
    table: string;
    op: "PUT" | "PATCH" | "DELETE";
    id: string;
    opData?: Record<string, unknown>;
  }>,
): UploadEntry[] {
  return crud.map((entry) => ({
    table: entry.table,
    op: entry.op,
    id: entry.id,
    ...(entry.opData ? { data: entry.opData } : {}),
  }));
}

export function powerSyncMutationId(
  deviceId: string,
  crud: Array<{ clientId: number }>,
) {
  return `ps:${deviceId}:${crud[0]?.clientId ?? 0}:${crud[crud.length - 1]?.clientId ?? 0}`;
}

export class BacksterPowerSyncConnector implements PowerSyncBackendConnector {
  constructor(
    private readonly apiUrl: string,
    private readonly getAuthToken: TokenProvider,
    private readonly deviceId: string,
  ) {}

  private endpoint(path: string) {
    const origin = this.apiUrl.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
    return `${origin}/api/v1/${path}`;
  }

  async fetchCredentials() {
    let clerkToken: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      clerkToken = (await this.getAuthToken())?.trim() || null;
      if (clerkToken) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
    if (!clerkToken) throw new Error("Sign in to connect");

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${clerkToken}`);
    const response = await fetch(this.endpoint("powersync/token"), {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `PowerSync credentials failed (${response.status})${
          detail ? `: ${detail.slice(0, 240)}` : ""
        }`,
      );
    }
    const body = (await response.json()) as {
      endpoint?: string;
      token?: string;
    };
    if (!body.endpoint || !body.token) {
      throw new Error("PowerSync credentials response missing endpoint/token");
    }
    return {
      endpoint: body.endpoint.replace(/\/+$/, ""),
      token: body.token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const batch = await database.getCrudBatch();
    if (!batch) return;
    const mutationId = powerSyncMutationId(this.deviceId, batch.crud);
    const authToken = await this.getAuthToken();
    if (!authToken) throw new Error("Missing session for upload");
    const response = await fetch(this.endpoint("powersync/write"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        device_id: this.deviceId,
        mutation_id: mutationId,
        batch: mapCrudBatch(batch.crud),
      }),
    });
    if (!response.ok) {
      throw new Error(
        `PowerSync upload failed (${response.status}): ${await response.text()}`,
      );
    }
    await batch.complete();
  }
}

export function isNativeSqliteThreadError(reason: unknown): boolean {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : String(reason ?? "");
  return (
    /thread constructor failed/i.test(message) ||
    /resource temporarily unavailable/i.test(message)
  );
}

/**
 * SQL.js in Expo Go; OP-SQLite for dev-client / production (New Architecture).
 * Quick SQLite's JSI install fails under RN New Arch — OP-SQLite is the
 * PowerSync-recommended native adapter for Expo 53+.
 *
 * `forceSqlJs` is a recovery path when OP-SQLite cannot spawn threads on
 * device (seen on some iPhones after a reconnect storm).
 */
export function createPowerSyncDatabase(
  userId: string,
  options?: { forceSqlJs?: boolean },
) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 12);
  const isExpoGo = Constants.executionEnvironment === "storeClient";
  const useSqlJs = isExpoGo || Boolean(options?.forceSqlJs);
  const dbFilename = useSqlJs
    ? `bos-mobile-${safeUserId}-sqljs.db`
    : `bos-mobile-${safeUserId}.db`;

  return new PowerSyncDatabase({
    schema: appSchema,
    database: useSqlJs
      ? new SQLJSOpenFactory({ dbFilename })
      : new OPSqliteOpenFactory({ dbFilename }),
    // Avoid aggressive internal reconnect while native threads are scarce.
    retryDelayMs: 10_000,
  });
}
