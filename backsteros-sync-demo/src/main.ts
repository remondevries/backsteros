import { clerkEnabled, getClerkSessionToken, mountSignIn, onClerkAuthChange } from "./clerk";
import { addTask, connectPowerSync, db, listTasks } from "./powersync";

const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const signInEl = document.querySelector<HTMLDivElement>("#sign-in")!;
const appEl = document.querySelector<HTMLDivElement>("#app")!;
const tasksEl = document.querySelector<HTMLUListElement>("#tasks")!;
const titleEl = document.querySelector<HTMLInputElement>("#title")!;
const addBtn = document.querySelector<HTMLButtonElement>("#add")!;

let connected = false;

function setStatus(message: string, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

async function startSync() {
  if (connected) {
    return;
  }

  const useClerkTokenFlow = clerkEnabled();

  try {
    setStatus("Connecting to PowerSync…");
    await connectPowerSync({
      useClerkTokenFlow,
      getAuthToken: async () => {
        if (useClerkTokenFlow) {
          return getClerkSessionToken();
        }
        return import.meta.env.VITE_POWERSYNC_TOKEN ?? null;
      },
    });
    connected = true;
    setStatus(
      useClerkTokenFlow
        ? "Connected to production PowerSync. Tasks sync from Neon via PowerSync."
        : "Connected. Tasks sync from Postgres via PowerSync.",
    );

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

function showApp(signedIn: boolean) {
  if (clerkEnabled()) {
    signInEl.hidden = signedIn;
    appEl.hidden = !signedIn;
    if (signedIn) {
      void startSync();
    } else {
      setStatus("Sign in to connect to production PowerSync.");
    }
    return;
  }

  signInEl.hidden = true;
  appEl.hidden = false;
  void startSync();
}

async function main() {
  if (clerkEnabled()) {
    mountSignIn(signInEl);
    onClerkAuthChange(showApp);
    return;
  }

  showApp(true);
}

void main();
