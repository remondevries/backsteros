"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatUiCardPart, ChatUiProgressCardData } from "@backsteros/contracts";
import {
  chatUiProgressCardDataSchema,
  isChatThreadProgressTerminal,
} from "@backsteros/contracts";
import {
  CheckIcon,
  CircleIcon,
  DotFillIcon,
  XIcon,
} from "@primer/octicons-react";

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

function StepIcon({
  state,
}: {
  state: "pending" | "running" | "done" | "failed";
}) {
  if (state === "done") {
    return <CheckIcon size={12} className="chat-ui-progress__step-icon" />;
  }
  if (state === "failed") {
    return <XIcon size={12} className="chat-ui-progress__step-icon" />;
  }
  if (state === "running") {
    return <DotFillIcon size={12} className="chat-ui-progress__step-icon" />;
  }
  return <CircleIcon size={12} className="chat-ui-progress__step-icon" />;
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

  const stateClass =
    data.state === "succeeded"
      ? "is-succeeded"
      : data.state === "failed"
        ? "is-failed"
        : data.state === "canceled"
          ? "is-canceled"
          : "is-running";

  return (
    <div
      className={[
        "chat-ui-progress",
        stateClass,
        locked ? "is-locked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-message-id={data.messageId}
      data-progress-state={data.state}
    >
      <div className="chat-ui-progress__header">
        <span
          className={[
            "chat-ui-progress__title",
            data.state === "running" ? "live-status-shine" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {data.title}
        </span>
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
          {data.steps.map((step, index) => (
            <li
              key={`${index}-${step.label}`}
              className={`chat-ui-progress__step is-${step.state}`}
            >
              <StepIcon state={step.state} />
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
          ))}
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
