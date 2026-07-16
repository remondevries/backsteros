import {
  AbstractPowerSyncDatabase,
  column,
  PowerSyncBackendConnector,
  PowerSyncDatabase,
  Schema,
  Table,
} from "@powersync/web";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
const POWERSYNC_URL = import.meta.env.VITE_POWERSYNC_URL ?? "http://localhost:8080";
const POWERSYNC_TOKEN = import.meta.env.VITE_POWERSYNC_TOKEN ?? "";

export type TokenProvider = () => Promise<string | null>;

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
    completed_at: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { status: ["status"] } },
);

const appSchema = new Schema({ tasks });
type AppDatabase = (typeof appSchema)["types"];

class BacksterConnector implements PowerSyncBackendConnector {
  constructor(
    private readonly getAuthToken: TokenProvider,
    private readonly useClerkTokenFlow: boolean,
  ) {}

  async fetchCredentials() {
    if (this.useClerkTokenFlow) {
      const clerkToken = await this.getAuthToken();
      if (!clerkToken) {
        throw new Error("Sign in with Clerk to connect");
      }

      const response = await fetch(`${API_URL}/api/v1/powersync/token`, {
        headers: { Authorization: `Bearer ${clerkToken}` },
      });
      if (!response.ok) {
        throw new Error(`Token fetch failed: ${response.status} ${await response.text()}`);
      }
      const payload = (await response.json()) as { endpoint: string; token: string };
      return { endpoint: payload.endpoint, token: payload.token };
    }

    const devToken = POWERSYNC_TOKEN || (await this.getAuthToken());
    if (!devToken) {
      throw new Error("Set VITE_POWERSYNC_TOKEN or sign in with Clerk");
    }

    return {
      endpoint: POWERSYNC_URL,
      token: devToken,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const batch = await database.getCrudBatch();
    if (!batch) {
      return;
    }

    const entries = batch.crud.map((op) => ({
      table: op.table,
      op: op.op,
      id: op.id,
      data: op.opData,
    }));

    const authToken = await this.getAuthToken();
    if (!authToken) {
      throw new Error("Missing auth token for upload");
    }

    const response = await fetch(`${API_URL}/api/v1/powersync/write`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ batch: entries }),
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
    }

    await batch.complete();
  }
}

export const db = new PowerSyncDatabase({
  schema: appSchema,
  database: { dbFilename: "backsteros-sync-demo.db" },
});

export async function connectPowerSync(options: {
  getAuthToken: TokenProvider;
  useClerkTokenFlow: boolean;
}) {
  const connector = new BacksterConnector(options.getAuthToken, options.useClerkTokenFlow);
  await db.connect(connector);
  await db.waitForReady();
}

export async function listTasks() {
  return db.getAll<AppDatabase["tasks"]>(
    `SELECT id, title, status, updated_at
     FROM tasks
     WHERE deleted_at IS NULL
     ORDER BY sort_order, updated_at DESC`,
  );
}

export async function addTask(title: string) {
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 21);
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO tasks (
      id, project_id, contact_id, assignee_id, number, title, description, status,
      priority, sort_order, due_date, triaged_at, inbox, completed_at,
      created_at, updated_at, deleted_at
    ) VALUES (?, NULL, NULL, NULL, 1, ?, NULL, 'ready_to_start', 0, 0, NULL, NULL, 1, NULL, ?, ?, NULL)`,
    [id, title, now, now],
  );
}
