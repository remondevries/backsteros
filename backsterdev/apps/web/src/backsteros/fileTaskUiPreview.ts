/**
 * TEMP — force file-task creating / success banners for visual polish.
 * Keep `false` now that Cloud Core mailbox wiring is live.
 */
export const FILE_TASK_UI_PREVIEW = false;

export const FILE_TASK_UI_PREVIEW_CREATING = {
  requestId: "preview-creating",
  agentName: "Sander",
  projectKey: "BDV",
  projectName: "BacksterDEV",
  briefPreview: "Polish the file-task creating banner",
  startedAt: Date.now(),
  phase: "creating" as const,
  taskId: null,
  taskRef: null,
  title: null,
  summary: null,
};

export const FILE_TASK_UI_PREVIEW_SUCCESS = {
  requestId: "preview-success",
  agentName: "Sander",
  projectKey: "BDV",
  projectName: "BacksterDEV",
  briefPreview: "Polish the file-task success banner",
  startedAt: Date.now(),
  phase: "success" as const,
  taskId: null,
  taskRef: "BDV-28",
  title: "File BacksterOS tasks from inside Development",
  summary: "Filed via Grok Bot",
};
