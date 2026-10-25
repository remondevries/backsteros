/**
 * Projects + tasks service barrel — implementation lives in `./tasks-projects/`.
 * Keep importing from `services/tasks-projects.js`.
 */
export { mergeLinkedCommitShas } from "../lib/linked-commit-shas.js";
export {
  listProjects,
  listProjectsPaginated,
  getProjectById,
  getProjectByKey,
  createProject,
  updateProject,
  deleteProject,
  getProjectKeyMap,
} from "./tasks-projects/projects.js";
export type {
  ProjectWriteOptions,
} from "./tasks-projects/projects.js";
export {
  createTask,
  updateTask,
  deleteTask,
  batchUpdateTasks,
  reorderTasks,
} from "./tasks-projects/task-writes.js";
export type {
  TaskWriteOptions,
} from "./tasks-projects/task-writes.js";
export {
  listTasks,
  getContactNameMap,
  listTasksPaginated,
  getTaskById,
  listDueTasks,
  listDueTasksPaginated,
  listInboxTasks,
} from "./tasks-projects/task-listing.js";
export type {
  TaskListItem,
  ListTasksPaginatedResult,
  DueTaskListItem,
} from "./tasks-projects/task-listing.js";
export {
  searchTasks,
} from "./tasks-projects/task-search.js";
export type {
  TaskSearchHit,
} from "./tasks-projects/task-search.js";
