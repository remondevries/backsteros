import { useEffect, useRef, useState, useSyncExternalStore, type FocusEvent } from "react";

import {
  formatTrackedTimeInput,
  parseTrackedTimeInput,
  resolveTrackedDurationSeconds,
  trackedDurationSecondsFromElapsed,
} from "./trackedTime";
import {
  bindTrackedTimerCallbacks,
  checkpointTrackedTimers,
  getTrackedTimerElapsedSeconds,
  getTrackedTimerVersion,
  isTrackedTimerRunning,
  pauseTrackedTimer,
  startTrackedTimer,
  subscribeTrackedTimers,
  syncTrackedTimerDuration,
} from "./trackedTimerStore";

function TrackedTimePlayIcon() {
  return (
    <svg
      className="bos-tracked-time-pill__toggle-icon"
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
      className="bos-tracked-time-pill__toggle-icon"
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

function TrackedTimePillDigits(props: { readonly totalSeconds: number; readonly live?: boolean }) {
  const [hours, mins, secs] = splitTrackedSeconds(props.totalSeconds);
  return (
    <span
      className={[
        "bos-tracked-time-pill__digits",
        props.live ? "bos-tracked-time-pill__digits--live" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <span className="bos-tracked-time-pill__part">{hours}</span>
      <span className="bos-tracked-time-pill__sep">:</span>
      <span className="bos-tracked-time-pill__part">{mins}</span>
      <span className="bos-tracked-time-pill__sep">:</span>
      <span
        className={[
          "bos-tracked-time-pill__part",
          props.live ? "bos-tracked-time-pill__part--seconds" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {secs}
      </span>
    </span>
  );
}

/**
 * Inline tracked-time pill matching BacksterOS desktop `TrackedTimeField`
 * (pill / inline-chip variant).
 *
 * Running sessions live in `trackedTimerStore` so closing the task rail or
 * navigating away does not pause the timer.
 */
export function BacksterosTrackedTimeField(props: {
  readonly timerKey: string;
  readonly trackedDurationSeconds?: number | null;
  readonly trackedMinutes?: number | null;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly onTrackedDurationSecondsChange?: (seconds: number | null) => void;
  readonly onTimerSessionChange?: (action: "start" | "pause", seconds?: number | null) => void;
}) {
  const label = props.label ?? "Time tracked";
  const disabled = props.disabled ?? false;
  const timerKey = props.timerKey;
  const trackedDurationSeconds = props.trackedDurationSeconds ?? null;
  const trackedMinutes = props.trackedMinutes ?? null;

  const [pendingSeconds, setPendingSeconds] = useState<number | null>(null);
  const effectiveTrackedDurationSeconds =
    pendingSeconds != null && trackedDurationSeconds != null
      ? Math.max(pendingSeconds, trackedDurationSeconds)
      : (pendingSeconds ?? trackedDurationSeconds);
  const displaySeconds = resolveTrackedDurationSeconds({
    trackedDurationSeconds: effectiveTrackedDurationSeconds,
    trackedMinutes,
  });
  const [draft, setDraft] = useState(() => formatTrackedTimeInput(displaySeconds));
  const [isEditingTime, setIsEditingTime] = useState(false);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const canEdit = Boolean(props.onTrackedDurationSecondsChange) && !disabled;

  const onPersistRef = useRef(props.onTrackedDurationSecondsChange);
  onPersistRef.current = props.onTrackedDurationSecondsChange;
  const onTimerSessionChangeRef = useRef(props.onTimerSessionChange);
  onTimerSessionChangeRef.current = props.onTimerSessionChange;

  useSyncExternalStore(subscribeTrackedTimers, getTrackedTimerVersion, getTrackedTimerVersion);

  const isRunning = isTrackedTimerRunning(timerKey);
  const timerElapsedSeconds = isRunning
    ? getTrackedTimerElapsedSeconds(timerKey)
    : getTrackedTimerElapsedSeconds(timerKey) || (displaySeconds ?? 0);
  const elapsedSeconds = isRunning ? timerElapsedSeconds : 0;
  const pausedSeconds = !isRunning && timerElapsedSeconds > 0 ? timerElapsedSeconds : null;
  const settledSeconds = pendingSeconds ?? pausedSeconds ?? displaySeconds ?? 0;
  const shownSeconds = isRunning ? elapsedSeconds : settledSeconds;

  useEffect(() => {
    const unbind = bindTrackedTimerCallbacks(timerKey, {
      onPersist: (seconds) => {
        if (seconds != null) setPendingSeconds(seconds);
        onPersistRef.current?.(seconds);
      },
      onSessionChange: (action, seconds) => {
        onTimerSessionChangeRef.current?.(action, seconds);
      },
    });
    // Reattach after the rail remounts: soft-save elapsed without pausing.
    if (isTrackedTimerRunning(timerKey)) {
      checkpointTrackedTimers(true);
    }
    return unbind;
  }, [timerKey]);

  useEffect(() => {
    if (isRunning) return;
    syncTrackedTimerDuration(timerKey, effectiveTrackedDurationSeconds);
  }, [effectiveTrackedDurationSeconds, isRunning, timerKey]);

  useEffect(() => {
    if (pendingSeconds == null) return;
    if (trackedDurationSeconds != null && trackedDurationSeconds >= pendingSeconds) {
      setPendingSeconds(null);
    }
  }, [pendingSeconds, trackedDurationSeconds]);

  useEffect(() => {
    if (isRunning) {
      setIsEditingTime(false);
      return;
    }
    setDraft(formatTrackedTimeInput(settledSeconds));
  }, [settledSeconds, isRunning]);

  useEffect(() => {
    if (!isEditingTime) return;
    timeInputRef.current?.focus();
    timeInputRef.current?.select();
  }, [isEditingTime]);

  const commit = (raw: string) => {
    if (!props.onTrackedDurationSecondsChange || isRunning) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      props.onTrackedDurationSecondsChange(null);
      setDraft("");
      return;
    }
    const parsed = parseTrackedTimeInput(trimmed);
    if (parsed == null) {
      setDraft(formatTrackedTimeInput(settledSeconds));
      return;
    }
    props.onTrackedDurationSecondsChange(parsed);
    syncTrackedTimerDuration(timerKey, parsed);
    setDraft(formatTrackedTimeInput(parsed));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    commit(event.currentTarget.value);
    setIsEditingTime(false);
  };

  const handleToggleTimer = () => {
    if (!canEdit) return;

    if (isRunning) {
      const paused = pauseTrackedTimer(timerKey);
      if (!paused) return;
      const seconds = trackedDurationSecondsFromElapsed(paused.totalSeconds);
      setPendingSeconds(seconds);
      setDraft(formatTrackedTimeInput(seconds));
      return;
    }

    let baseSeconds = displaySeconds ?? 0;
    if (draft.trim()) {
      const parsed = parseTrackedTimeInput(draft);
      if (parsed != null) baseSeconds = parsed;
    }
    startTrackedTimer(timerKey, baseSeconds);
  };

  const inputValue = draft.trim() ? draft : formatTrackedTimeInput(settledSeconds);

  const toggleButton = (
    <button
      type="button"
      className="bos-tracked-time-pill__toggle"
      disabled={!canEdit}
      aria-label={isRunning ? "Pause timer" : "Start timer"}
      aria-pressed={isRunning}
      onClick={handleToggleTimer}
    >
      {isRunning ? <TrackedTimePauseIcon /> : <TrackedTimePlayIcon />}
    </button>
  );

  const timeControl = isRunning ? (
    <div
      className="bos-tracked-time-pill__time"
      aria-live="polite"
      aria-label={`${label}, running`}
    >
      <TrackedTimePillDigits totalSeconds={shownSeconds} live />
    </div>
  ) : isEditingTime && canEdit ? (
    <input
      ref={timeInputRef}
      type="text"
      inputMode="numeric"
      className="bos-tracked-time-pill__input"
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
      className="bos-tracked-time-pill__time"
      disabled={!canEdit}
      aria-label={label}
      onClick={() => {
        if (!canEdit) return;
        setIsEditingTime(true);
      }}
    >
      <span className="bos-tracked-time-pill__value">
        {formatTrackedTimeInput(shownSeconds) || "00:00:00"}
      </span>
    </button>
  );

  return (
    <div className="bos-tracked-time-pill-wrap">
      <div
        className={["bos-tracked-time-pill", isRunning ? "is-running" : null]
          .filter(Boolean)
          .join(" ")}
      >
        {toggleButton}
        {timeControl}
      </div>
    </div>
  );
}
