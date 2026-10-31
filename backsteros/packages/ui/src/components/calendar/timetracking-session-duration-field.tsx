"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const Impl = lazy(async () => {
  const mod = await import("./timetracking-session-duration-field-impl.js");
  return { default: mod.TimetrackingSessionDurationField };
});

export type { TimetrackingSessionDurationFieldProps } from "./timetracking-session-duration-field-impl.js";

export function TimetrackingSessionDurationField(
  props: ComponentProps<typeof Impl>,
) {
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  );
}
