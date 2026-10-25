"use client";

import { useMemo } from "react";

import {
  ActionSwap,
  type ActionSwapProps,
  type ActionSwapState,
} from "../action-swap/action-swap.js";
import { ActionSwapSuccessIconSwap } from "../action-swap/action-swap-icons.js";

export type SettingsTestConnectionSwapProps = {
  disabled?: boolean;
  /** Runs the connection test. Resolve on success; reject (or throw) on failure. */
  onTest: () => void | PromiseLike<unknown>;
  idleLabel?: string;
  successLabel?: string;
  failureLabel?: string;
  /** When set, keep a label during the working phase instead of folding to a spinner. */
  pendingLabel?: string;
  size?: ActionSwapProps["size"];
  className?: string;
};

/**
 * Test-connection control that morphs idle → spinner → green check / red bolt circle.
 * Settled results stay until the user clicks again (hover shows refresh + blue).
 */
export function SettingsTestConnectionSwap({
  disabled = false,
  onTest,
  idleLabel = "Test",
  successLabel = "Connected",
  failureLabel = "Connection failed",
  pendingLabel,
  size = "sm",
  className,
}: SettingsTestConnectionSwapProps) {
  const states = useMemo<ActionSwapState[]>(
    () => [
      {
        id: "idle",
        label: idleLabel,
        tone: "quiet",
      },
      {
        id: "ok",
        label: successLabel,
        icon: <ActionSwapSuccessIconSwap />,
        tone: "success",
        iconOnly: true,
        repeatable: true,
        pendingLabel,
      },
    ],
    [idleLabel, pendingLabel, successLabel],
  );

  return (
    <ActionSwap
      className={className}
      size={size}
      disabled={disabled}
      failureLabel={failureLabel}
      states={states}
      onAction={(next) => {
        if (next.id !== "ok") return;
        return onTest();
      }}
    />
  );
}
