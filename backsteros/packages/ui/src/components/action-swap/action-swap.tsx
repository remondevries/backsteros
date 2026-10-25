"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionStyle,
  type TargetAndTransition,
  type Transition,
  type Variants,
} from "motion/react";
import { ThinkingOrb } from "thinking-orbs";

import { ActionSwapFailureIconSwap } from "./action-swap-icons.js";
import { motionTokens } from "./motion-tokens.js";

export type ActionSwapTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "quiet"
  | "danger";

export interface ActionSwapState {
  id: string;
  label: string;
  icon?: ReactNode;
  tone?: ActionSwapTone;
  /** Shown while `onAction` runs on the way into this state. Without it the pill folds into a round spinner. */
  pendingLabel?: string;
  /** Fold to an icon-only circle; `label` stays for aria / live region. */
  iconOnly?: boolean;
  /** Press runs `onAction` again for this state instead of advancing. */
  repeatable?: boolean;
  /** Milliseconds to hold this state before advancing on its own. */
  holdFor?: number;
}

export interface ActionSwapProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    | "children"
    | "onChange"
    | "onClick"
    | "value"
    | "onDrag"
    | "onDragEnd"
    | "onDragStart"
    | "onAnimationStart"
  > {
  states: ActionSwapState[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, state: ActionSwapState) => void;
  /** Return a promise to show the working phase; a rejection shows `failureLabel`. */
  onAction?: (
    next: ActionSwapState,
    current: ActionSwapState,
  ) => void | PromiseLike<unknown>;
  failureLabel?: string;
  size?: "sm" | "md" | "lg";
}

type Phase =
  | { kind: "idle" }
  | { kind: "working"; target: ActionSwapState }
  | { kind: "failed" };

const IDLE: Phase = { kind: "idle" };
const MIN_WORKING = 450;
const ICON = 16;
/** Inline Thinking Orb size (libraries.dev `shaping` preset). */
const ORB = 20;

const pressVariants: Variants = {
  pressed: (button: RefObject<HTMLButtonElement | null>) => ({
    scale: (button.current?.offsetWidth ?? 0) > 220 ? 0.985 : 0.97,
    transition: {
      duration: motionTokens.duration.instant,
      ease: [...motionTokens.ease.standard],
    },
  }),
};
const morph = motionTokens.spring.morph;
const instant = { duration: motionTokens.duration.instant } as const;
const soft = `blur(${motionTokens.blur.soft}px)`;
const tween = {
  duration: motionTokens.duration.standard,
  ease: [...motionTokens.ease.enter],
} as const;
const leave = {
  duration: motionTokens.duration.fast,
  ease: [...motionTokens.ease.standard],
} as const;
const rest: TargetAndTransition = {
  opacity: 1,
  y: 0,
  scale: 1,
  filter: "blur(0px)",
};
const fadeIn: TargetAndTransition = { ...rest, opacity: 0 };
const fadeOut: TargetAndTransition = { opacity: 0, transition: instant };
const glyphIn: TargetAndTransition = { opacity: 0, y: 4, filter: soft };
const glyphOut: TargetAndTransition = {
  opacity: 0,
  y: -3,
  filter: soft,
  transition: leave,
};
const iconIn: TargetAndTransition = { opacity: 0, scale: 0.5, filter: soft };
const iconOut: TargetAndTransition = { ...iconIn, transition: leave };
const iconEnter: Transition = {
  scale: motionTokens.spring.snappy,
  opacity: tween,
  filter: tween,
};
const successIn: TargetAndTransition = {
  ...iconIn,
  clipPath: "inset(0% 100% 0% 0%)",
};
const successRest: TargetAndTransition = {
  ...rest,
  clipPath: "inset(0% 0% 0% 0%)",
};
const successEnter: Transition = {
  scale: { type: "spring", visualDuration: 0.45, bounce: 0 },
  opacity: tween,
  filter: tween,
  clipPath: {
    duration: 0.36,
    ease: [...motionTokens.ease.standard],
    delay: 0.02,
  },
};

function useMorphWidth(
  content: RefObject<HTMLElement | null>,
  key: string,
  reduced: boolean,
) {
  const width = useMotionValue<number | "auto">("auto");
  const lastKey = useRef(key);
  const armedUntil = useRef(0);
  useLayoutEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    armedUntil.current = performance.now() + 700;
  }, [key]);
  useEffect(() => {
    const node = content.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let measured = false;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next =
        entry.borderBoxSize?.[0]?.inlineSize ?? node.offsetWidth;
      if (
        !measured ||
        reduced ||
        performance.now() > armedUntil.current
      ) {
        measured = true;
        width.jump(next);
        return;
      }
      animate(width, next, morph);
    });
    observer.observe(node, { box: "border-box" });
    return () => observer.disconnect();
  }, [content, reduced, width]);
  return useTransform(width, (value) =>
    typeof value === "number" ? Math.max(0, value) : value,
  );
}

type Glyph = { id: string; char: string; order: number; lead: number };
const toGlyphs = (
  chars: string[],
  seq: number,
  lead = 0,
): Glyph[] =>
  chars.map((char, order) => ({ id: `${seq}:${order}`, char, order, lead }));

function useGlyphs(text: string) {
  const [state, setState] = useState(() => ({
    text,
    seq: 0,
    glyphs: toGlyphs([...text], 0),
  }));
  if (state.text === text) return state.glyphs;
  const prev = [...state.text];
  const next = [...text];
  let start = 0;
  let end = 0;
  while (
    start < prev.length &&
    start < next.length &&
    prev[start] === next[start]
  ) {
    start++;
  }
  while (
    end < prev.length - start &&
    end < next.length - start &&
    prev[prev.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end++;
  }
  if (start < 2) start = 0;
  if (end < 2) end = 0;
  const seq = state.seq + 1;
  const glyphs = [
    ...state.glyphs.slice(0, start),
    ...toGlyphs(
      next.slice(start, next.length - end),
      seq,
      prev.length ? 0 : 0.1,
    ),
    ...state.glyphs.slice(state.glyphs.length - end),
  ];
  setState({ text, seq, glyphs });
  return glyphs;
}

function MorphText({
  text,
  gap,
  reduced,
}: {
  text: string;
  gap: boolean;
  reduced: boolean;
}) {
  const glyphs = useGlyphs(text);
  const rowRef = useRef<HTMLSpanElement>(null);
  const layoutKey = `${gap ? 1 : 0}${text}`;
  const width = useMorphWidth(rowRef, layoutKey, reduced);
  return (
    <motion.span
      className="action-swap__morph"
      style={{ width }}
      aria-hidden="true"
    >
      <span
        ref={rowRef}
        className="action-swap__glyphs"
        data-gap={gap || undefined}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {glyphs.map((glyph) => (
            <motion.span
              key={glyph.id}
              className="action-swap__glyph"
              layout={reduced ? false : "position"}
              layoutDependency={layoutKey}
              initial={reduced ? fadeIn : glyphIn}
              animate={rest}
              exit={reduced ? fadeOut : glyphOut}
              transition={
                reduced
                  ? instant
                  : {
                      ...tween,
                      delay:
                        glyph.lead +
                        Math.min(glyph.order * motionTokens.stagger.char, 0.12),
                      layout: morph,
                    }
              }
            >
              {glyph.char}
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
    </motion.span>
  );
}

export function ActionSwap({
  states,
  value,
  defaultValue,
  onValueChange,
  onAction,
  failureLabel = "Connection failed",
  size = "md",
  className,
  disabled,
  style,
  ...props
}: ActionSwapProps) {
  const firstId = states[0]?.id ?? "";
  const [internalValue, setInternalValue] = useState(defaultValue ?? firstId);
  const [phase, setPhase] = useState<Phase>(IDLE);
  const [spoken, setSpoken] = useState("");
  /** CSS :hover stays true if the pointer never left — gate refresh chrome until re-enter. */
  const [hoverArmed, setHoverArmed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const run = useRef(0);
  const reduced = useReducedMotion() ?? false;
  const activeValue = value ?? internalValue;
  const activeIndex = Math.max(
    0,
    states.findIndex((state) => state.id === activeValue),
  );
  const activeState = states[activeIndex] ?? states[0];
  const nextState = states[(activeIndex + 1) % states.length] ?? activeState;
  const inactive = disabled || states.length < 2;
  const working = phase.kind === "working";
  const failed = phase.kind === "failed";
  const folded =
    (phase.kind === "working" && !phase.target.pendingLabel) ||
    failed ||
    (phase.kind === "idle" &&
      Boolean(activeState?.iconOnly && activeState.icon));
  const iconOnlyChrome =
    failed ||
    (phase.kind === "idle" && Boolean(activeState?.iconOnly && activeState.icon));

  function commit(next: ActionSwapState) {
    setPhase(IDLE);
    if (value === undefined) setInternalValue(next.id);
    setSpoken(next.label);
    onValueChange?.(next.id, next);
  }
  function fail() {
    setPhase({ kind: "failed" });
    setSpoken(failureLabel);
  }
  function advance() {
    if (!activeState || inactive || working) return;
    const next = activeState.repeatable ? activeState : nextState;
    if (!next) return;
    const id = ++run.current;
    let result: void | PromiseLike<unknown>;
    try {
      result = onAction?.(next, activeState);
    } catch {
      fail();
      return;
    }
    if (!result || typeof result.then !== "function") {
      if (!activeState.repeatable) commit(next);
      return;
    }
    setPhase({ kind: "working", target: next });
    setSpoken(next.pendingLabel ?? "Working");
    const started = performance.now();
    const settle = (done: () => void) =>
      window.setTimeout(() => {
        if (run.current === id) done();
      }, Math.max(0, MIN_WORKING - (performance.now() - started)));
    result.then(
      () => settle(() => commit(next)),
      () => settle(fail),
    );
  }

  const latest = useRef({ commit, nextState });
  useLayoutEffect(() => {
    latest.current = { commit, nextState };
  });
  useEffect(
    () => () => {
      run.current += 1;
    },
    [],
  );
  const holdFor = phase.kind === "idle" ? activeState?.holdFor : undefined;
  useEffect(() => {
    if (!holdFor) return;
    const timer = window.setTimeout(() => {
      const { commit: settle, nextState: next } = latest.current;
      if (next) settle(next);
    }, holdFor);
    return () => window.clearTimeout(timer);
  }, [holdFor, activeState?.id]);
  const fold = useMotionValue(folded ? 1 : 0);
  useEffect(() => {
    animate(fold, folded ? 1 : 0, reduced ? { duration: 0 } : morph);
  }, [fold, folded, reduced]);

  const viewKey =
    phase.kind === "working"
      ? "working"
      : phase.kind === "failed"
        ? "failed"
        : `state:${activeState?.id ?? ""}`;
  useEffect(() => {
    // Settling (or any chrome swap) under a still pointer must show the result,
    // not the blue refresh hover — require leave + re-enter.
    setHoverArmed(false);
  }, [viewKey]);

  if (!activeState) return null;

  const view =
    phase.kind === "working"
      ? {
          key: "working" as const,
          label: phase.target.pendingLabel ?? "",
          announce: phase.target.pendingLabel ?? "Working",
          icon: (
            <span className="action-swap__spinner" aria-hidden>
              {/*
                Orb’s own RAF loop stops under prefers-reduced-motion.
                The wrapper CSS spin always runs so progress still moves.
              */}
              <ThinkingOrb
                state="shaping"
                size={ORB}
                theme="dark"
                paused={false}
              />
            </span>
          ),
          /* Quiet while working — success green is only for the settled result. */
          tone: "quiet",
        }
      : phase.kind === "failed"
        ? {
            key: "failed" as const,
            label: "",
            announce: failureLabel,
            icon: <ActionSwapFailureIconSwap />,
            tone: "danger" as const,
          }
        : {
            key: `state:${activeState.id}`,
            label: activeState.iconOnly ? "" : activeState.label,
            announce: activeState.label,
            icon: activeState.icon,
            tone: (activeState.tone ?? "neutral") as ActionSwapTone,
          };
  const draw =
    (view.tone === "success" || view.tone === "danger") &&
    phase.kind !== "working" &&
    !reduced;

  const {
    onPointerEnter: onPointerEnterProp,
    onPointerLeave: onPointerLeaveProp,
    ...buttonProps
  } = props;

  return (
    <>
      <motion.button
        {...buttonProps}
        ref={buttonRef}
        type={buttonProps.type ?? "button"}
        tabIndex={buttonProps.tabIndex ?? 0}
        className={[
          "action-swap",
          `action-swap--${size}`,
          `action-swap--${view.tone}`,
          iconOnlyChrome ? "action-swap--icon-only" : null,
          hoverArmed && !working && !inactive ? "action-swap--hover" : null,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ ...style, "--fold": fold } as MotionStyle}
        disabled={inactive}
        aria-disabled={working || undefined}
        aria-busy={working || undefined}
        aria-label={
          failed
            ? `${failureLabel}. Test again`
            : activeState.repeatable && phase.kind === "idle"
              ? `${view.announce || activeState.label}. Test again`
              : view.announce || activeState.label
        }
        data-phase={phase.kind}
        onClick={advance}
        onPointerEnter={(event) => {
          setHoverArmed(true);
          onPointerEnterProp?.(event);
        }}
        onPointerLeave={(event) => {
          setHoverArmed(false);
          onPointerLeaveProp?.(event);
        }}
        custom={buttonRef}
        variants={pressVariants}
        whileTap={
          reduced || inactive || working ? undefined : "pressed"
        }
        transition={motionTokens.spring.snappy}
      >
        <motion.span
          className="action-swap__icon"
          aria-hidden="true"
          initial={false}
          animate={{
            width: view.icon
              ? view.key === "working"
                ? ORB
                : ICON
              : 0,
            height: view.icon
              ? view.key === "working"
                ? ORB
                : ICON
              : 0,
          }}
          transition={
            reduced ? { duration: 0 } : motionTokens.spring.smooth
          }
        >
          <AnimatePresence initial={false}>
            {view.icon ? (
              <motion.span
                key={view.key}
                className="action-swap__icon-phase"
                data-tone={view.tone}
                initial={
                  reduced ? fadeIn : draw ? successIn : iconIn
                }
                animate={draw ? successRest : rest}
                exit={reduced ? fadeOut : iconOut}
                transition={
                  reduced
                    ? instant
                    : draw
                      ? successEnter
                      : iconEnter
                }
              >
                {view.icon}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </motion.span>
        <MorphText
          text={view.label}
          gap={Boolean(view.icon) && view.label.length > 0}
          reduced={reduced}
        />
      </motion.button>
      <span className="action-swap__sr-only" role="status" aria-live="polite">
        {spoken}
      </span>
    </>
  );
}
