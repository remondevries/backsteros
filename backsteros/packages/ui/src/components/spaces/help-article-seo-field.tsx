"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const Impl = lazy(async () => {
  const mod = await import("./help-article-seo-field-impl.js");
  return { default: mod.HelpArticleSeoField };
});

export type { HelpArticleSeoFieldProps } from "./help-article-seo-field-impl.js";

export function HelpArticleSeoField(
  props: ComponentProps<typeof Impl>,
) {
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  );
}
