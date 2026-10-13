import { create } from "zustand";

/** Sidebar presence for an in-flight or just-completed file-task webhook job. */
export type FileTaskCreatingJob = {
  readonly requestId: string;
  readonly agentName: string;
  readonly projectKey: string | null;
  readonly projectName: string;
  readonly briefPreview: string;
  readonly startedAt: number;
  readonly phase: "creating" | "success";
  readonly taskId: string | null;
  readonly taskRef: string | null;
  readonly title: string | null;
  readonly summary: string | null;
};

type FileTaskCreatingState = {
  /** In-flight filing — independent of a sticky success strip. */
  readonly creating: FileTaskCreatingJob | null;
  /** Completed filing — only the user dismisses this. */
  readonly success: FileTaskCreatingJob | null;
  readonly markCreating: (
    job: Omit<FileTaskCreatingJob, "phase" | "taskId" | "taskRef" | "title" | "summary">,
  ) => void;
  readonly markSuccess: (result: {
    readonly requestId: string;
    readonly taskId?: string | null;
    readonly taskRef?: string | null;
    readonly title?: string | null;
    readonly summary?: string | null;
  }) => void;
  readonly dismissCreating: () => void;
  readonly dismissSuccess: () => void;
};

export const useFileTaskCreatingStore = create<FileTaskCreatingState>((set, get) => ({
  creating: null,
  success: null,
  markCreating: (job) =>
    set({
      creating: {
        ...job,
        phase: "creating",
        taskId: null,
        taskRef: null,
        title: null,
        summary: null,
      },
    }),
  markSuccess: (result) => {
    const creating = get().creating;
    const matched = creating?.requestId === result.requestId ? creating : null;
    const base = matched ?? {
      requestId: result.requestId,
      agentName: "Agent",
      projectKey: null,
      projectName: "",
      briefPreview: "",
      startedAt: Date.now(),
    };
    set({
      // Clear only the matching in-flight job; leave a different creating alone.
      creating: matched ? null : creating,
      success: {
        ...base,
        phase: "success",
        taskId: result.taskId?.trim() || null,
        taskRef: result.taskRef?.trim() || null,
        title: result.title?.trim() || null,
        summary: result.summary?.trim() || null,
      },
    });
  },
  dismissCreating: () => set({ creating: null }),
  dismissSuccess: () => set({ success: null }),
}));
