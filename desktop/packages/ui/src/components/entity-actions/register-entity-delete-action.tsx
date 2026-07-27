"use client";

import { useId, useLayoutEffect } from "react";

import {
  useEntityHeaderActionsContext,
  type EntityDeleteConfig,
} from "./entity-header-actions-context.js";
import { useLatestRef } from "./use-latest-ref.js";

export function RegisterEntityDeleteAction({
  entityLabel,
  confirmLabel,
  onDelete,
}: EntityDeleteConfig) {
  const ownerId = useId();
  const { registerDeleteConfig, clearDeleteConfig } =
    useEntityHeaderActionsContext();
  const onDeleteRef = useLatestRef(onDelete);

  useLayoutEffect(() => {
    registerDeleteConfig(ownerId, {
      entityLabel,
      confirmLabel,
      onDelete: () => onDeleteRef.current(),
    });
    return () => clearDeleteConfig(ownerId);
  }, [
    clearDeleteConfig,
    confirmLabel,
    entityLabel,
    onDeleteRef,
    ownerId,
    registerDeleteConfig,
  ]);

  return null;
}
