/**
 * Demo workspace content for the development server (OS-148).
 * Idempotent: skips when project key DEMO already exists.
 */
import { eq } from "drizzle-orm";

import { db } from "./index.js";
import { projects } from "./schema.js";
import { resolveLocalShellOwner } from "../services/local-shell-auth.js";
import { createProject } from "../services/tasks-projects/projects.js";
import { createTask } from "../services/tasks-projects/task-writes.js";

const DEMO_PROJECT_KEY = "DEMO";

async function main() {
  const owner = await resolveLocalShellOwner();
  console.log(
    `Local shell owner ready: user=${owner.userId} workspace=${owner.workspaceId}`,
  );

  const [existing] = await db
    .select({ id: projects.id, key: projects.key })
    .from(projects)
    .where(eq(projects.key, DEMO_PROJECT_KEY))
    .limit(1);

  if (existing) {
    console.log(
      `Demo project ${DEMO_PROJECT_KEY} already exists (${existing.id}); skipping seed-demo.`,
    );
    return;
  }

  const project = await createProject(
    owner.workspaceId,
    {
      key: DEMO_PROJECT_KEY,
      name: "Demo project",
      summary: "Seed data for the development server (OS-148).",
      status: "active",
      type: "general",
    },
    undefined,
    db,
    { skipVaultSideEffects: true },
  );

  const taskTitles = [
    "Welcome — open this task to verify the UI",
    "Try creating a new task in Demo",
    "Reset the DB with scripts/dev-server.sh reset when you want a clean slate",
  ];

  for (const title of taskTitles) {
    await createTask(owner.workspaceId, {
      title,
      projectId: project.id,
      status: "todo",
    });
  }

  console.log(
    `Seeded demo project ${DEMO_PROJECT_KEY} (${project.id}) with ${taskTitles.length} tasks.`,
  );
  console.log(
    "Browser auth: local-shell bearer `local` (no password). Open the web UI over Tailscale.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
