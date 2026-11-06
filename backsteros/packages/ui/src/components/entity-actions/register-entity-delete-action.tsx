"use client";

import { useId, useLayoutEffect } from "react";

import { useListKeyboardNavMountGate } from "../../list-nav/list-keyboard-nav-mount-gate.js";
import {
  useEntityHeaderActionsContextOptional,
  type EntityDeleteConfig,
} from "./entity-header-actions-context.js";
import { useLatestRef } from "./use-latest-ref.js";

export function RegisterEntityDeleteAction({
  entityLabel,
  confirmLabel,
  actionVerb,
  onDelete,
  secondaryAction,
}: EntityDeleteConfig) {
  const ownerId = useId();
  const mountGate = useListKeyboardNavMountGate();
  const context = useEntityHeaderActionsContextOptional();
  const registerDeleteConfig = context?.registerDeleteConfig;
  const clearDeleteConfig = context?.clearDeleteConfig;
  const onDeleteRef = useLatestRef(onDelete);
  const secondaryOnConfirmRef = useLatestRef(secondaryAction?.onConfirm);

  useLayoutEffect(() => {
    if (!registerDeleteConfig || !clearDeleteConfig) return;
    if (!mountGate) {
      clearDeleteConfig(ownerId);
      return;
    }
    registerDeleteConfig(ownerId, {
      entityLabel,
      confirmLabel,
      actionVerb,
      onDelete: () => onDeleteRef.current(),
      ...(secondaryAction
        ? {
            secondaryAction: {
              label: secondaryAction.label,
              shortcutKey: secondaryAction.shortcutKey,
              onConfirm: () =>
                secondaryOnConfirmRef.current
                  ? secondaryOnConfirmRef.current()
                  : Promise.resolve({
                      ok: false as const,
                      error: "Action is unavailable.",
                    }),
            },
          }
        : {}),
    });
    return () => clearDeleteConfig(ownerId);
  }, [
    actionVerb,
    clearDeleteConfig,
    confirmLabel,
    entityLabel,
    mountGate,
    onDeleteRef,
    ownerId,
    registerDeleteConfig,
    secondaryAction,
    secondaryAction?.label,
    secondaryAction?.shortcutKey,
    secondaryOnConfirmRef,
  ]);

  return null;
}
