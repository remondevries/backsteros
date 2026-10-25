"use client";

import { Check } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";

import { ActionSwapBoltIcon } from "../action-swap/action-swap-icons.js";
import type { ActionSwapProps } from "../action-swap/action-swap.js";

export type SettingsConnectionStatus = "working" | "success" | "failed";

export type SettingsConnectionStatusSwapProps = {
  status: SettingsConnectionStatus;
  size?: ActionSwapProps["size"];
  className?: string;
  successLabel?: string;
  failureLabel?: string;
  workingLabel?: string;
};

const ORB = 20;

/**
 * Read-only Action Swap chrome for connection probes: orb → green check / red bolt.
 * Same visual language as {@link SettingsTestConnectionSwap}, without click/hover retest.
 */
export function SettingsConnectionStatusSwap({
  status,
  size = "sm",
  className,
  successLabel = "Connected",
  failureLabel = "Not connected",
  workingLabel = "Checking connection",
}: SettingsConnectionStatusSwapProps) {
  const tone =
    status === "working" ? "quiet" : status === "success" ? "success" : "danger";
  const label =
    status === "working"
      ? workingLabel
      : status === "success"
        ? successLabel
        : failureLabel;

  return (
    <span
      role="status"
      aria-label={label}
      aria-busy={status === "working" || undefined}
      data-phase={status === "working" ? "working" : "idle"}
      className={[
        "action-swap",
        `action-swap--${size}`,
        `action-swap--${tone}`,
        "action-swap--icon-only",
        "action-swap--status",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="action-swap__icon" aria-hidden="true">
        <span
          className="action-swap__icon-phase"
          data-tone={tone === "quiet" ? undefined : tone}
        >
          {status === "working" ? (
            <span className="action-swap__spinner">
              <ThinkingOrb
                state="shaping"
                size={ORB}
                theme="dark"
                paused={false}
              />
            </span>
          ) : status === "success" ? (
            <Check size={14} strokeWidth={2.5} />
          ) : (
            <ActionSwapBoltIcon size={14} />
          )}
        </span>
      </span>
    </span>
  );
}
