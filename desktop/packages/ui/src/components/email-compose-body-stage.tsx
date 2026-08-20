"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { TaskStatusWorkingPulse } from "./task-status-working-pulse.js";

const TEXT_FADE_MS = 240;
const HEIGHT_MS = 300;
const REVEAL_MS = 260;

type StagePhase = "idle" | "text-out" | "working" | "resize" | "reveal";

export type EmailComposeBodyStageProps = {
  body: string;
  agentWorking: boolean;
  children: ReactNode;
};

function EmailComposeWorkingIndicator() {
  return (
    <div className="email-compose-working" role="status" aria-live="polite">
      <TaskStatusWorkingPulse size={18} aria-label="Composing email" />
      <span>Composing email…</span>
    </div>
  );
}

/**
 * Draft-body transition: fade current text out, show composing in the middle,
 * resize to the new height, then fade the indicator out and the new text in.
 */
export function EmailComposeBodyStage({
  body,
  agentWorking,
  children,
}: EmailComposeBodyStageProps) {
  const [phase, setPhase] = useState<StagePhase>("idle");
  const [frozenChildren, setFrozenChildren] = useState<ReactNode>(children);
  const [shownChildren, setShownChildren] = useState<ReactNode>(children);
  const [stageHeight, setStageHeight] = useState<number | null>(null);
  const [indicatorVisible, setIndicatorVisible] = useState(false);
  const [textVisible, setTextVisible] = useState(true);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const childrenRef = useRef(children);
  const bodyRef = useRef(body);
  const phaseRef = useRef<StagePhase>("idle");
  const wasWorkingRef = useRef(false);
  const cycleRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  childrenRef.current = children;
  bodyRef.current = body;
  phaseRef.current = phase;

  const clearTimers = () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  };

  const later = (ms: number, fn: () => void) => {
    const timer = window.setTimeout(fn, ms);
    timersRef.current.push(timer);
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    const wasWorking = wasWorkingRef.current;
    wasWorkingRef.current = agentWorking;

    if (agentWorking && !wasWorking) {
      const currentPhase = phaseRef.current;
      if (currentPhase !== "idle" && currentPhase !== "reveal") return;

      cycleRef.current += 1;
      const cycle = cycleRef.current;
      clearTimers();
      setFrozenChildren(childrenRef.current);
      setShownChildren(childrenRef.current);
      const currentHeight = stageRef.current?.getBoundingClientRect().height ?? 0;
      if (currentHeight > 0) setStageHeight(currentHeight);

      if (!bodyRef.current.trim()) {
        setPhase("working");
        setTextVisible(false);
        setIndicatorVisible(true);
        if (currentHeight < 56) setStageHeight(56);
        return;
      }

      setPhase("text-out");
      setTextVisible(false);
      later(TEXT_FADE_MS, () => {
        if (cycleRef.current !== cycle) return;
        setPhase("working");
        setIndicatorVisible(true);
      });
      return;
    }

    if (!agentWorking && wasWorking) {
      const currentPhase = phaseRef.current;
      if (
        currentPhase !== "working" &&
        currentPhase !== "text-out" &&
        currentPhase !== "resize"
      ) {
        return;
      }

      const cycle = cycleRef.current;
      clearTimers();

      later(48, () => {
        if (cycleRef.current !== cycle) return;
        const currentHeight =
          stageRef.current?.getBoundingClientRect().height ?? 56;
        const nextHeight = measureRef.current?.scrollHeight ?? 0;
        const targetHeight = nextHeight > 0 ? nextHeight : currentHeight;
        const nextChildren = childrenRef.current;

        setShownChildren(nextChildren);
        setStageHeight(currentHeight);
        setPhase("resize");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cycleRef.current !== cycle) return;
            setStageHeight(targetHeight);
          });
        });
        later(HEIGHT_MS, () => {
          if (cycleRef.current !== cycle) return;
          setPhase("reveal");
          setIndicatorVisible(false);
          setTextVisible(true);
          later(REVEAL_MS, () => {
            if (cycleRef.current !== cycle) return;
            setPhase("idle");
            setStageHeight(null);
            setFrozenChildren(nextChildren);
            setShownChildren(nextChildren);
          });
        });
      });
    }
  }, [agentWorking]);

  // While idle, always render the live children so Edit/Preview toggles and
  // typing update the DOM. Frozen/shown snapshots are only for the agent
  // working animation cycle.
  const displayChildren =
    phase === "idle"
      ? children
      : phase === "reveal"
        ? shownChildren
        : frozenChildren;

  const style: CSSProperties =
    stageHeight != null && phase !== "idle"
      ? { height: `${stageHeight}px` }
      : {};

  return (
    <div
      ref={stageRef}
      className={`email-compose-body-stage${
        phase !== "idle" ? " is-animating" : ""
      }`}
      style={style}
    >
      <div
        className={`email-compose-body-stage__text${
          textVisible ? " is-visible" : ""
        }`}
      >
        {displayChildren}
      </div>
      <div
        ref={measureRef}
        className="email-compose-body-stage__measure"
        aria-hidden
      >
        {children}
      </div>
      <div
        className={`email-compose-body-stage__overlay${
          indicatorVisible ? " is-visible" : ""
        }`}
      >
        <EmailComposeWorkingIndicator />
      </div>
    </div>
  );
}
