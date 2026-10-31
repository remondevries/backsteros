"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const Impl = lazy(async () => {
  const mod = await import("./social-composer-plain-editor-impl.js");
  return { default: mod.SocialComposerPlainEditor };
});

export type { SocialComposerPlainEditorProps } from "./social-composer-plain-editor-impl.js";

export function SocialComposerPlainEditor(
  props: ComponentProps<typeof Impl>,
) {
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  );
}
