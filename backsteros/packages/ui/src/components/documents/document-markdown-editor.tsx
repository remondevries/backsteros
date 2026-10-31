"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const Impl = lazy(async () => {
  const mod = await import("./document-markdown-editor-impl.js");
  return { default: mod.DocumentMarkdownEditor };
});

export type { DocumentMarkdownEditorProps } from "./document-markdown-editor-impl.js";

export function DocumentMarkdownEditor(
  props: ComponentProps<typeof Impl>,
) {
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  );
}
