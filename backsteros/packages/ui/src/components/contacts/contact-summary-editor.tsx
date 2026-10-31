"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const Impl = lazy(async () => {
  const mod = await import("./contact-summary-editor-impl.js");
  return { default: mod.ContactSummaryEditor };
});

export type { ContactSummaryEditorProps } from "./contact-summary-editor-impl.js";

export function ContactSummaryEditor(
  props: ComponentProps<typeof Impl>,
) {
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  );
}
