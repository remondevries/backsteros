"use client";

import { useId, useLayoutEffect } from "react";

import { useListKeyboardNavMountGate } from "../../list-nav/list-keyboard-nav-mount-gate.js";
import {
  useEntityHeaderActionsContext,
  type EntityDuplicateConfig,
} from "./entity-header-actions-context.js";
import { useLatestRef } from "./use-latest-ref.js";

export function RegisterEntityDuplicateAction({
  onDuplicate,
  disabled = false,
  confirm,
  entityLabel,
}: EntityDuplicateConfig) {
  const ownerId = useId();
  const mountGate = useListKeyboardNavMountGate();
  const { registerDuplicateConfig, clearDuplicateConfig } =
    useEntityHeaderActionsContext();
  const onDuplicateRef = useLatestRef(onDuplicate);

  useLayoutEffect(() => {
    if (!mountGate) {
      clearDuplicateConfig(ownerId);
      return;
    }
    registerDuplicateConfig(ownerId, {
      disabled,
      confirm,
      entityLabel,
      onDuplicate: (options) => onDuplicateRef.current(options),
    });
    return () => clearDuplicateConfig(ownerId);
  }, [
    clearDuplicateConfig,
    confirm,
    disabled,
    entityLabel,
    mountGate,
    onDuplicateRef,
    ownerId,
    registerDuplicateConfig,
  ]);

  return null;
}
