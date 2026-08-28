"use client";

import {
  formatTrackedTimeInput,
  parseTrackedTimeInput,
  resolveTrackedDurationSeconds,
  trackedDurationSecondsFromElapsed,
} from "@backsteros/contracts";
import { PauseIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
} from "react";

import { PropertyFieldGroup } from "../content/property-field-group.js";
import {
  buildTrackedTimerKey,
  useTrackedTimerOptional,
  type TrackedTimerSessionMeta,
} from "../../tracked-timer/tracked-timer-context.js";

export type TrackedTimeFieldProps = {
  trackedDurationSeconds?: number | null;
  trackedMinutes?: number | null;
  scheduleMinutes?: number | null;
  disabled?: boolean;
  label?: string;
  /** Pill timer above properties rail; `property` keeps the labeled field row. */
  variant?: "pill" | "property";
  onTrackedDurationSecondsChange?: (seconds: number | null) => void;
  onTimerSessionChange?: (
    action: "start" | "pause",
    seconds?: number | null,
  ) => void;
  timerSession?: TrackedTimerSessionMeta | null;
};

function TrackedTimePlayIcon() {
  return (
    <svg
      className="tracked-time-pill__toggle-icon"
      width="5"
      height="6"
      viewBox="0 0 5 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M0.379002 0.0358538L4.643 2.59485C4.67985 2.61711 4.71033 2.6485 4.73149 2.68599C4.75264 2.72349 4.76376 2.7658 4.76376 2.80885C4.76376 2.8519 4.75264 2.89422 4.73149 2.93171C4.71033 2.96921 4.67985 3.0006 4.643 3.02285L0.379002 5.58185C0.341084 5.60469 0.297782 5.61706 0.253521 5.61768C0.20926 5.61831 0.165627 5.60717 0.127082 5.5854C0.0885366 5.56364 0.0564609 5.53203 0.0341335 5.49381C0.0118061 5.45558 2.75074e-05 5.41212 1.45813e-06 5.36785V0.250853C-0.000149996 0.206503 0.0114996 0.162911 0.0337549 0.124549C0.0560101 0.0861865 0.0880699 0.054435 0.126646 0.0325517C0.165221 0.0106684 0.208924 -0.000558831 0.253271 2.14022e-05C0.297617 0.000601636 0.341012 0.0129687 0.379002 0.0358538Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TrackedTimePauseIcon() {
  return (
    <svg
      className="tracked-time-pill__toggle-icon"
      width="6"
      height="6"
      viewBox="0 0 6 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0.75" y="0.75" width="1.5" height="4.5" rx="0.35" fill="currentColor" />
      <rect x="3.75" y="0.75" width="1.5" height="4.5" rx="0.35" fill="currentColor" />
    </svg>
  );
}

function splitTrackedSeconds(totalSeconds: number): [string, string, string] {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [
    String(hours).padStart(2, "0"),
    String(mins).padStart(2, "0"),
    String(secs).padStart(2, "0"),
  ];
}

function TrackedTimePillDigits({
  totalSeconds,
  live = false,
}: {
  totalSeconds: number;
  live?: boolean;
}) {
  const [hours, mins, secs] = splitTrackedSeconds(totalSeconds);
  return (
    <span
      className={[
        "tracked-time-pill__digits",
        live ? "tracked-time-pill__digits--live" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <span className="tracked-time-pill__part">{hours}</span>
      <span className="tracked-time-pill__sep">:</span>
      <span className="tracked-time-pill__part">{mins}</span>
      <span className="tracked-time-pill__sep">:</span>
      <span
        className={[
          "tracked-time-pill__part",
          live ? "tracked-time-pill__part--seconds" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {secs}
      </span>
    </span>
  );
}

export function TrackedTimeField({
  trackedDurationSeconds = null,
  trackedMinutes = null,
  scheduleMinutes = null,
  disabled = false,
  label = "Time tracked",
  variant = "pill",
  onTrackedDurationSecondsChange,
  onTimerSessionChange,
  timerSession = null,
}: TrackedTimeFieldProps) {
  const trackedTimer = useTrackedTimerOptional();
  const timerKey = timerSession
    ? buildTrackedTimerKey(timerSession.kind, timerSession.entityId)
    : null;

  const [pendingSeconds, setPendingSeconds] = useState<number | null>(null);
  const effectiveTrackedDurationSeconds =
    pendingSeconds != null && trackedDurationSeconds != null
      ? Math.max(pendingSeconds, trackedDurationSeconds)
      : (pendingSeconds ?? trackedDurationSeconds);
  const displaySeconds = resolveTrackedDurationSeconds({
    trackedDurationSeconds: effectiveTrackedDurationSeconds,
    trackedMinutes,
    scheduleMinutes,
  });
  const [draft, setDraft] = useState(() =>
    formatTrackedTimeInput(displaySeconds),
  );
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [localRunning, setLocalRunning] = useState(false);
  const [, setLocalTick] = useState(0);
  const baseSecondsRef = useRef(0);
  const sessionStartRef = useRef<number | null>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const canEdit = Boolean(onTrackedDurationSecondsChange) && !disabled;

  const usesGlobalTimer = Boolean(trackedTimer && timerKey && timerSession);
  const isRunning = usesGlobalTimer
    ? trackedTimer!.isTimerRunning(timerKey!)
    : localRunning;

  const registerTimerRef = useRef(trackedTimer?.registerTimer);
  registerTimerRef.current = trackedTimer?.registerTimer;
  const syncTimerDurationSecondsRef = useRef(
    trackedTimer?.syncTimerDurationSeconds,
  );
  syncTimerDurationSecondsRef.current = trackedTimer?.syncTimerDurationSeconds;
  const getElapsedSecondsRef = useRef(trackedTimer?.getElapsedSeconds);
  getElapsedSecondsRef.current = trackedTimer?.getElapsedSeconds;
  const timerTick = trackedTimer?.timerTick ?? 0;

  const onPersistRef = useRef(onTrackedDurationSecondsChange);
  onPersistRef.current = onTrackedDurationSecondsChange;
  const onTimerSessionChangeRef = useRef(onTimerSessionChange);
  onTimerSessionChangeRef.current = onTimerSessionChange;
  const registrationTrackedSecondsRef = useRef(effectiveTrackedDurationSeconds);
  registrationTrackedSecondsRef.current = effectiveTrackedDurationSeconds;

  useEffect(() => {
    if (pendingSeconds == null) return;
    if (
      trackedDurationSeconds != null &&
      trackedDurationSeconds >= pendingSeconds
    ) {
      setPendingSeconds(null);
    }
  }, [pendingSeconds, trackedDurationSeconds]);

  useLayoutEffect(() => {
    if (!usesGlobalTimer || !timerKey || !timerSession) {
      return;
    }
    return registerTimerRef.current?.({
      ...timerSession,
      trackedDurationSeconds: registrationTrackedSecondsRef.current,
      trackedMinutes,
      scheduleMinutes,
      onPersist: (seconds) => {
        setPendingSeconds(seconds);
        setDraft(formatTrackedTimeInput(seconds));
        setIsEditingTime(false);
        onPersistRef.current?.(seconds);
      },
      onSessionChange: (action, sessionSeconds) => {
        if (action === "started") {
          onTimerSessionChangeRef.current?.("start");
          return;
        }
        // Session elapsed for activity copy; total duration persists via onPersist.
        onTimerSessionChangeRef.current?.("pause", sessionSeconds ?? null);
      },
    });
  }, [
    scheduleMinutes,
    timerKey,
    timerSession?.entityId,
    timerSession?.href,
    timerSession?.kind,
    timerSession?.subtitle,
    timerSession?.statusKey,
    timerSession?.title,
    trackedMinutes,
    usesGlobalTimer,
  ]);

  useEffect(() => {
    if (!usesGlobalTimer || !timerKey) return;
    syncTimerDurationSecondsRef.current?.(
      timerKey,
      effectiveTrackedDurationSeconds,
      trackedMinutes,
      scheduleMinutes,
    );
  }, [
    effectiveTrackedDurationSeconds,
    scheduleMinutes,
    timerKey,
    trackedMinutes,
    usesGlobalTimer,
  ]);

  const getLocalElapsedSeconds = useCallback(() => {
    const base = baseSecondsRef.current;
    if (!localRunning || sessionStartRef.current == null) return base;
    return base + Math.floor((Date.now() - sessionStartRef.current) / 1000);
  }, [localRunning]);

  const timerElapsedSeconds =
    usesGlobalTimer && timerKey
      ? getElapsedSecondsRef.current?.(timerKey) ?? 0
      : getLocalElapsedSeconds();
  void timerTick;

  const elapsedSeconds = isRunning ? timerElapsedSeconds : 0;

  const pausedSeconds =
    !isRunning && timerElapsedSeconds > 0 ? timerElapsedSeconds : null;
  const settledSeconds =
    pendingSeconds ??
    pausedSeconds ??
    displaySeconds ??
    0;

  useEffect(() => {
    if (isRunning) {
      setIsEditingTime(false);
      return;
    }
    setDraft(formatTrackedTimeInput(settledSeconds));
  }, [settledSeconds, isRunning, timerTick]);

  useEffect(() => {
    if (!isEditingTime) return;
    timeInputRef.current?.focus();
    timeInputRef.current?.select();
  }, [isEditingTime]);

  useEffect(() => {
    if (usesGlobalTimer || !localRunning) return;
    const id = window.setInterval(() => setLocalTick((value) => value + 1), 1000);
    return () => {
      clearInterval(id);
      if (sessionStartRef.current == null || !onTrackedDurationSecondsChange) {
        return;
      }
      const elapsed = Math.floor(
        (Date.now() - sessionStartRef.current) / 1000,
      );
      const totalSeconds = baseSecondsRef.current + elapsed;
      sessionStartRef.current = null;
      onTrackedDurationSecondsChange(
        trackedDurationSecondsFromElapsed(totalSeconds),
      );
    };
  }, [localRunning, onTrackedDurationSecondsChange, usesGlobalTimer]);

  const commit = (raw: string) => {
    if (!onTrackedDurationSecondsChange || isRunning) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      onTrackedDurationSecondsChange(null);
      setDraft("");
      return;
    }
    const parsed = parseTrackedTimeInput(trimmed);
    if (parsed == null) {
      setDraft(formatTrackedTimeInput(settledSeconds));
      return;
    }
    onTrackedDurationSecondsChange(parsed);
    setDraft(formatTrackedTimeInput(parsed));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    commit(event.currentTarget.value);
    setIsEditingTime(false);
  };

  const handleToggleTimer = () => {
    if (!canEdit) return;
    if (usesGlobalTimer && timerKey) {
      trackedTimer!.toggleTimer(timerKey);
      return;
    }

    if (localRunning) {
      const sessionSeconds =
        sessionStartRef.current != null
          ? Math.max(0, Math.floor((Date.now() - sessionStartRef.current) / 1000))
          : 0;
      const totalSeconds = getLocalElapsedSeconds();
      sessionStartRef.current = null;
      setLocalRunning(false);
      const seconds = trackedDurationSecondsFromElapsed(totalSeconds);
      setDraft(formatTrackedTimeInput(seconds));
      onTrackedDurationSecondsChange?.(seconds);
      onTimerSessionChangeRef.current?.("pause", sessionSeconds);
      return;
    }

    let baseSeconds = displaySeconds ?? 0;
    if (draft.trim()) {
      const parsed = parseTrackedTimeInput(draft);
      if (parsed != null) baseSeconds = parsed;
    }
    baseSecondsRef.current = baseSeconds;
    sessionStartRef.current = Date.now();
    setLocalRunning(true);
    onTimerSessionChangeRef.current?.("start");
  };

  const derivedHint =
    variant === "property" &&
    !isRunning &&
    trackedDurationSeconds == null &&
    trackedMinutes == null &&
    scheduleMinutes != null &&
    scheduleMinutes > 0 &&
    onTrackedDurationSecondsChange
      ? "From calendar"
      : null;

  const shownSeconds = isRunning ? elapsedSeconds : settledSeconds;
  const inputValue = draft.trim()
    ? draft
    : formatTrackedTimeInput(settledSeconds);

  const toggleButton = (
    <button
      type="button"
      className={
        variant === "pill"
          ? "tracked-time-pill__toggle"
          : "tracked-time-field__toggle"
      }
      disabled={!canEdit}
      aria-label={isRunning ? "Pause timer" : "Start timer"}
      aria-pressed={isRunning}
      onClick={handleToggleTimer}
    >
      {isRunning ? (
        variant === "pill" ? (
          <TrackedTimePauseIcon />
        ) : (
          <PauseIcon size={8} aria-hidden="true" />
        )
      ) : (
        <TrackedTimePlayIcon />
      )}
    </button>
  );

  const timeControl = isRunning ? (
    <div
      className={
        variant === "pill"
          ? "tracked-time-pill__time"
          : "tracked-time-field__live property-dropdown-trigger"
      }
      aria-live="polite"
      aria-label={`${label}, running`}
    >
      {variant === "pill" ? (
        <TrackedTimePillDigits totalSeconds={shownSeconds} live />
      ) : (
        <>
          <span className="tracked-time-field__live-head">
            {formatTrackedTimeInput(shownSeconds).slice(0, -2)}
          </span>
          <span className="tracked-time-field__seconds">
            {formatTrackedTimeInput(shownSeconds).slice(-2)}
          </span>
        </>
      )}
    </div>
  ) : isEditingTime && canEdit ? (
    <input
      ref={timeInputRef}
      type="text"
      inputMode="numeric"
      className={
        variant === "pill"
          ? "tracked-time-pill__input"
          : "tracked-time-field__input property-dropdown-trigger"
      }
      placeholder="00:00:00"
      value={inputValue}
      size={8}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={handleBlur}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit((event.target as HTMLInputElement).value);
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(formatTrackedTimeInput(settledSeconds));
          setIsEditingTime(false);
        }
      }}
    />
  ) : (
    <button
      type="button"
      className={
        variant === "pill"
          ? "tracked-time-pill__time"
          : "tracked-time-field__input property-dropdown-trigger"
      }
      disabled={!canEdit}
      aria-label={label}
      onClick={() => {
        if (!canEdit) return;
        setIsEditingTime(true);
      }}
    >
      {variant === "pill" ? (
        isRunning ? (
          <TrackedTimePillDigits totalSeconds={shownSeconds} live />
        ) : (
          <span className="tracked-time-pill__value">
            {formatTrackedTimeInput(shownSeconds) || "00:00:00"}
          </span>
        )
      ) : (
        inputValue || "00:00:00"
      )}
    </button>
  );

  if (variant === "pill") {
    return (
      <div className="tracked-time-pill-wrap">
        <div
          className={["tracked-time-pill", isRunning ? "is-running" : null]
            .filter(Boolean)
            .join(" ")}
        >
          {toggleButton}
          {timeControl}
        </div>
        {derivedHint ? (
          <span className="tracked-time-pill__hint">{derivedHint}</span>
        ) : null}
      </div>
    );
  }

  return (
    <PropertyFieldGroup label={label}>
      <div
        className={[
          "tracked-time-field",
          isRunning ? "is-running" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="tracked-time-field__row">
          {toggleButton}
          {timeControl}
        </div>
        {derivedHint ? (
          <span className="tracked-time-field__hint">{derivedHint}</span>
        ) : null}
      </div>
    </PropertyFieldGroup>
  );
}
