import { useState } from "react";
import {
  deriveTimelineEntriesFromVisibleTurnItemsWithState,
  type TimelineEntriesInput,
  type TimelineEntriesProjection,
} from "../session-logic";
import { noteRenderPhaseSetState } from "../components/chat/renderPhaseSetState";

/** Element-identity compare — callers often pass freshly filtered/mapped arrays. */
export function sameReadonlyArray<T>(
  left: ReadonlyArray<T> | undefined,
  right: ReadonlyArray<T> | undefined,
): boolean {
  if (Object.is(left, right)) return true;
  if (left === undefined || right === undefined) return false;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (!Object.is(left[i], right[i])) return false;
  }
  return true;
}

/**
 * ChatView rebuilds `visibleTurnItems` / `anchoredMessages` with `.filter` /
 * `.flatMap` every render. Reference equality would setState every pass and
 * storm ChatView (prevCheckpoint=before-jsx, no noted site).
 */
export function sameTimelineEntriesInput(
  left: TimelineEntriesInput,
  right: TimelineEntriesInput,
): boolean {
  return (
    sameReadonlyArray(left.visibleTurnItems, right.visibleTurnItems) &&
    sameReadonlyArray(left.optimisticMessages, right.optimisticMessages) &&
    sameReadonlyArray(left.anchoredMessages, right.anchoredMessages) &&
    left.attachmentUrlById === right.attachmentUrlById &&
    sameReadonlyArray(left.attempts, right.attempts) &&
    sameReadonlyArray(left.nodes, right.nodes) &&
    sameReadonlyArray(left.plans, right.plans)
  );
}

/**
 * Timeline entries for a thread, derived from the previous projection so
 * unchanged rows keep their identity and memoized rows skip rendering. A new
 * thread starts from scratch.
 */
export function useIncrementalTimelineEntries(
  threadKey: string | null,
  input: TimelineEntriesInput,
): TimelineEntriesProjection["entries"] {
  const [state, setState] = useState(() => ({
    threadKey,
    projection: deriveTimelineEntriesFromVisibleTurnItemsWithState(input),
  }));
  if (state.threadKey === threadKey && sameTimelineEntriesInput(state.projection.input, input)) {
    return state.projection.entries;
  }
  const projection = deriveTimelineEntriesFromVisibleTurnItemsWithState(
    input,
    state.threadKey === threadKey ? state.projection : null,
  );
  noteRenderPhaseSetState(
    `useIncrementalTimelineEntries:${threadKey ?? "null"}:${input.visibleTurnItems.length}`,
  );
  setState({ threadKey, projection });
  return projection.entries;
}
