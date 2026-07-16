import { addTask, connectPowerSync, db, listTasks } from "./powersync";

const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const tasksEl = document.querySelector<HTMLUListElement>("#tasks")!;
const titleEl = document.querySelector<HTMLInputElement>("#title")!;
const addBtn = document.querySelector<HTMLButtonElement>("#add")!;

function setStatus(message: string, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

async function renderTasks() {
  const rows = await listTasks();
  tasksEl.innerHTML = rows
    .map(
      (task) =>
        `<li><strong>${escapeHtml(task.title)}</strong> <small>(${task.status})</small></li>`,
    )
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function main() {
  try {
    setStatus("Connecting to PowerSync…");
    await connectPowerSync();
    setStatus("Connected. Tasks sync from Postgres via PowerSync.");

    await renderTasks();

    db.watch(
      `SELECT id, title, status, updated_at FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC`,
      [],
      {
        onResult: async () => {
          await renderTasks();
        },
      },
    );

    addBtn.addEventListener("click", async () => {
      const title = titleEl.value.trim();
      if (!title) {
        return;
      }
      titleEl.value = "";
      await addTask(title);
    });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

void main();
