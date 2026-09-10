import { createFileRoute } from "@tanstack/react-router";

import { UsagePage } from "../components/usage/UsagePage";
import { isUsageSectionId, type UsageSectionId } from "../components/usage/UsageSidebarNav";

export type UsageSearch = {
  readonly section: UsageSectionId;
};

export const Route = createFileRoute("/usage")({
  validateSearch: (raw: Record<string, unknown>): UsageSearch => ({
    section: isUsageSectionId(raw.section) ? raw.section : "premium",
  }),
  component: UsagePage,
});
