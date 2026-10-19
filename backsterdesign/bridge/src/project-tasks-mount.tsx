import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";

import {
  ProjectTasksApp,
  type DesignFileNavItem,
  type ProjectTasksLayout,
} from "./project-tasks-app.js";
// Styles are loaded on demand (not in <head>) so Tailwind/UI tokens cannot
// blank the Penpot shell before the island mounts.
import "./styles.css";

type MountOptions = {
  penpotProjectId: string;
  /** `rail` = list + adjacent detail (project overview). Default `stack`. */
  layout?: ProjectTasksLayout | string;
  /** Open task id from the dashboard URL (`?task-id=`). */
  taskId?: string | null;
  /** Called when the user opens or closes a task (keeps the URL in sync). */
  onTaskIdChange?: (taskId: string | null) => void;
  /** Penpot files for content-zone j/k navigation. */
  files?: DesignFileNavItem[];
  onOpenFile?: (fileId: string) => void;
};

const roots = new WeakMap<Element, Root>();
let stylesLinked = false;

function ensureStylesheet(): void {
  if (stylesLinked || typeof document === "undefined") return;
  const href = "css/backsteros-project-tasks.css";
  if (document.querySelector(`link[href*="backsteros-project-tasks.css"]`)) {
    stylesLinked = true;
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${href}?version=${encodeURIComponent(
    (globalThis as { penpotVersionTag?: string }).penpotVersionTag || "develop",
  )}&island=cmd-e-view-mode1`;
  document.head.appendChild(link);
  stylesLinked = true;
}

function normalizeLayout(value: unknown): ProjectTasksLayout {
  return value === "rail" ? "rail" : "stack";
}

function normalizeFiles(value: unknown): DesignFileNavItem[] {
  if (!Array.isArray(value)) return [];
  const out: DesignFileNavItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { id?: unknown }).id ?? "").trim();
    if (!id) continue;
    const name = String((row as { name?: unknown }).name ?? "Untitled");
    out.push({ id, name });
  }
  return out;
}

function mount(el: Element, options: MountOptions): void {
  const penpotProjectId = options?.penpotProjectId?.trim();
  if (!penpotProjectId) {
    console.warn("[backsteros-project-tasks] missing penpotProjectId");
    return;
  }
  ensureStylesheet();
  let root = roots.get(el);
  if (!root) {
    root = createRoot(el);
    roots.set(el, root);
  }
  root.render(
    createElement(ProjectTasksApp, {
      penpotProjectId,
      layout: normalizeLayout(options?.layout),
      taskId: options?.taskId ?? null,
      onTaskIdChange: options?.onTaskIdChange,
      files: normalizeFiles(options?.files),
      onOpenFile: options?.onOpenFile,
    }),
  );
}

function unmount(el: Element): void {
  const root = roots.get(el);
  if (!root) return;
  root.unmount();
  roots.delete(el);
}

declare global {
  interface Window {
    BacksterDesignProjectTasks?: {
      mount: typeof mount;
      unmount: typeof unmount;
    };
  }
}

window.BacksterDesignProjectTasks = { mount, unmount };
