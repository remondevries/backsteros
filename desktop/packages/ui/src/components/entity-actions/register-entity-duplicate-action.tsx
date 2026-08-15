"use client";

import { useId, useLayoutEffect } from "react";

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
  const { registerDuplicateConfig, clearDuplicateConfig } =
    useEntityHeaderActionsContext();
  const onDuplicateRef = useLatestRef(onDuplicate);

  useLayoutEffect(() => {
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
    onDuplicateRef,
    ownerId,
    registerDuplicateConfig,
  ]);

  return null;
}
