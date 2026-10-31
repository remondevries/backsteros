"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const Impl = lazy(async () => {
  const mod = await import("./social-post-body-editor-impl.js");
  return { default: mod.SocialPostBodyEditor };
});

export type { SocialPostBodyEditorProps } from "./social-post-body-editor-impl.js";

export function SocialPostBodyEditor(
  props: ComponentProps<typeof Impl>,
) {
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  );
}
