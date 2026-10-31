"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatUiCardPart, ChatUiProgressCardData } from "@backsteros/contracts";
import {
  chatUiProgressCardDataSchema,
  isChatThreadProgressTerminal,
} from "@backsteros/contracts";

import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { TaskStatusWorkingPulse } from "../tasks/task-status-working-pulse.js";

function parseProgressData(
  part: ChatUiCardPart,
): ChatUiProgressCardData | null {
  const parsed = chatUiProgressCardDataSchema.safeParse(part.data ?? {});
  return parsed.success ? parsed.data : null;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** First pending step after the running one (or the first pending if none running). */
function indexOfNextPending(
  steps: readonly { state: string }[],
): number {
  const runningAt = steps.findIndex((step) => step.state === "running");
  const from = runningAt >= 0 ? runningAt + 1 : 0;
  for (let index = from; index < steps.length; index += 1) {
    if (steps[index]?.state === "pending") return index;
  }
  return steps.findIndex((step) => step.state === "pending");
}

function StepIcon({
  state,
  pendingVariant,
}: {
  state: "pending" | "running" | "done" | "failed";
  /** Next-up pending → empty ready-to-start ring; later pending → backlog. */
  pendingVariant?: "next" | "queued";
}) {
  if (state === "running") {
    return (
      <TaskStatusWorkingPulse
        size={14}
        compact
        className="chat-ui-progress__step-icon"
        aria-label="In progress"
      />
    );
  }
  if (state === "done") {
    return (
      <TaskStatusIcon
        status="completed"
        size={14}
        className="chat-ui-progress__step-icon"
        title="Completed"
      />
    );
  }
  if (state === "failed") {
    return (
      <svg
        className="chat-ui-progress__step-icon chat-ui-progress__step-icon--failed"
        viewBox="0 0 14 14"
        width={14}
        height={14}
        aria-label="Failed"
        role="img"
      >
        <title>Failed</title>
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M7 0a7 7 0 1 0 0 14A7 7 0 0 0 7 0Zm-3.5 6.15h7v1.7h-7z"
        />
      </svg>
    );
  }
  if (pendingVariant === "queued") {
    return (
      <TaskStatusIcon
        status="backlog"
        size={14}
        className="chat-ui-progress__step-icon"
        title="Queued"
      />
    );
  }
  return (
    <TaskStatusIcon
      status="ready_to_start"
      size={14}
      ringOnly
      className="chat-ui-progress__step-icon"
      title="Ready to start"
    />
  );
}

export function ChatProgressCard({ part }: { part: ChatUiCardPart }) {
  const data = useMemo(() => parseProgressData(part), [part]);
  const locked = data ? isChatThreadProgressTerminal(data.state) : true;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!data || locked) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [data, locked]);

  if (!data) return null;

  const createdMs = Date.parse(data.createdAt);
  const updatedMs = Date.parse(data.updatedAt);
  const endMs = locked
    ? (Number.isFinite(updatedMs) ? updatedMs : Date.now())
    : nowMs;
  const elapsedLabel = Number.isFinite(createdMs)
    ? formatElapsed(endMs - createdMs)
    : null;

  const showBar =
    data.current != null && data.total != null && data.total > 0;
  const pct = showBar
    ? Math.min(100, Math.round((data.current! / data.total!) * 100))
    : null;

  const barTone =
    data.state === "succeeded"
      ? "is-bar-complete"
      : data.state === "failed"
        ? "is-bar-failed"
        : "is-bar-active";
  const stateClass =
    data.state === "succeeded"
      ? "is-succeeded"
      : data.state === "failed"
        ? "is-failed"
        : data.state === "canceled"
          ? "is-canceled"
          : "is-running";
  const nextPendingAt =
    data.steps && data.steps.length > 0
      ? indexOfNextPending(data.steps)
      : -1;

  return (
    <div
      className={[
        "chat-ui-progress",
        stateClass,
        barTone,
        locked ? "is-locked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-message-id={data.messageId}
      data-progress-state={data.state}
    >
      <div className="chat-ui-progress__header">
        <span className="chat-ui-progress__title">{data.title}</span>
        {elapsedLabel ? (
          <span className="chat-ui-progress__elapsed" title="Elapsed">
            {elapsedLabel}
          </span>
        ) : null}
      </div>
      {showBar ? (
        <div
          className="chat-ui-progress__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={data.total}
          aria-valuenow={data.current}
          aria-label={`${data.current} of ${data.total}`}
        >
          <div
            className="chat-ui-progress__bar-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      {data.detail ? (
        <p className="chat-ui-progress__detail">{data.detail}</p>
      ) : null}
      {data.steps && data.steps.length > 0 ? (
        <ul className="chat-ui-progress__steps">
          {data.steps.map((step, index) => {
            const pendingVariant =
              step.state === "pending"
                ? index === nextPendingAt
                  ? ("next" as const)
                  : ("queued" as const)
                : undefined;
            return (
              <li
                key={`${index}-${step.label}`}
                className={`chat-ui-progress__step is-${step.state}`}
              >
                <StepIcon
                  state={step.state}
                  pendingVariant={pendingVariant}
                />
                <span
                  className={[
                    "chat-ui-progress__step-label",
                    step.state === "running" ? "live-status-shine" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function findProgressCardPart(
  parts: readonly { type: string; cardType?: string }[],
): ChatUiCardPart | null {
  for (const part of parts) {
    if (part.type === "card" && part.cardType === "progress") {
      return part as ChatUiCardPart;
    }
  }
  return null;
}
