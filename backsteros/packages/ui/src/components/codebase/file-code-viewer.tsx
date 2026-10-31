"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const Impl = lazy(async () => {
  const mod = await import("./file-code-viewer-impl.js");
  return { default: mod.FileCodeViewer };
});

export function FileCodeViewer(props: ComponentProps<typeof Impl>) {
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  );
}
