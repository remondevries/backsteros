import type { DiscoveredLocalServer, ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";
import {
  mapAtomCommandResult,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";

import { resolveDiscoveredServerUrl } from "~/browser/browserTargetResolver";
import type { OpenPreviewMutation } from "~/browser/openFileInPreview";
import { recordVisitForThread } from "~/browserHistoryStore";
import { openBrowserForThread } from "~/rightPanelProjectTools";
import { openPreviewSession } from "./openPreviewSession";

export async function openDiscoveredPort<E>(input: {
  readonly threadRef: ScopedThreadRef;
  readonly port: DiscoveredLocalServer;
  readonly openPreview: OpenPreviewMutation<E>;
  readonly projectRef?: ScopedProjectRef | null;
}): Promise<AtomCommandResult<void, E>> {
  const resolvedUrl = resolveDiscoveredServerUrl(input.threadRef.environmentId, input.port.url);
  const result = await openPreviewSession({
    openPreview: input.openPreview,
    threadRef: input.threadRef,
    url: resolvedUrl,
  });
  return mapAtomCommandResult(result, (snapshot) => {
    recordVisitForThread(input.threadRef, input.port.url);
    openBrowserForThread(input.threadRef, snapshot.tabId, input.projectRef);
  });
}
