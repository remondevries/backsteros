"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const Impl = lazy(async () => {
  const mod = await import("./task-comment-editor-impl.js");
  return { default: mod.TaskCommentEditor };
});

export type {
  TaskCommentEditorHandle,
  TaskCommentEditorProps,
  TaskCommentEditorVariant,
} from "./task-comment-editor-impl.js";

export function TaskCommentEditor(props: ComponentProps<typeof Impl>) {
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  );
}
