import {
  formatTrackedTimeInput,
  parseTrackedTimeInput,
  resolveTrackedDurationSeconds,
  trackedDurationSecondsFromElapsed,
} from "@backsteros/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  buildTrackedTimerKey,
  useTrackedTimerOptional,
  type TrackedTimerSessionMeta,
} from "../lib/tracked-timer/tracked-timer-context";
import { colors, spacing } from "../lib/theme";
import { TextInput } from "./app-text-input";

export type TrackedTimeFieldProps = {
  trackedDurationSeconds?: number | null;
  trackedMinutes?: number | null;
  scheduleMinutes?: number | null;
  disabled?: boolean;
  label?: string;
  variant?: "pill" | "property";
  style?: StyleProp<ViewStyle>;
  onTrackedDurationSecondsChange?: (seconds: number | null) => void;
  onTimerSessionChange?: (
    action: "start" | "pause",
    seconds?: number | null,
  ) => void;
  timerSession?: TrackedTimerSessionMeta | null;
};

function PlayIcon() {
  return (
    <View style={styles.playIcon}>
      <View style={styles.playTriangle} />
    </View>
  );
}

function PauseIcon() {
  return (
    <View style={styles.pauseIcon}>
      <View style={styles.pauseBar} />
      <View style={styles.pauseBar} />
    </View>
  );
}

export function TrackedTimeField({
  trackedDurationSeconds = null,
  trackedMinutes = null,
  scheduleMinutes = null,
  disabled = false,
  label = "Time tracked",
  variant = "pill",
  style,
  onTrackedDurationSecondsChange,
  onTimerSessionChange,
  timerSession = null,
}: TrackedTimeFieldProps) {
  const trackedTimer = useTrackedTimerOptional();
  const registerTimer = trackedTimer?.registerTimer;
  const syncTimerDurationSeconds = trackedTimer?.syncTimerDurationSeconds;
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

  const canEdit = Boolean(onTrackedDurationSecondsChange) && !disabled;
  const usesGlobalTimer = Boolean(trackedTimer && timerKey && timerSession);
  const isRunning = usesGlobalTimer
    ? trackedTimer!.isTimerRunning(timerKey!)
    : localRunning;
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

  useEffect(() => {
    if (!usesGlobalTimer || !registerTimer || !timerKey || !timerSession) return;
    return registerTimer({
      kind: timerSession.kind,
      entityId: timerSession.entityId,
      title: timerSession.title,
      subtitle: timerSession.subtitle ?? null,
      statusKey: timerSession.statusKey ?? null,
      href: timerSession.href,
      trackedDurationSeconds: registrationTrackedSecondsRef.current,
      trackedMinutes,
      scheduleMinutes,
      onPersist: (seconds, fromTimerPause) => {
        if (fromTimerPause) {
          setPendingSeconds(seconds);
          setDraft(formatTrackedTimeInput(seconds));
          setIsEditingTime(false);
          onTimerSessionChangeRef.current?.("pause", seconds);
          return;
        }
        setPendingSeconds(seconds);
        setDraft(formatTrackedTimeInput(seconds));
        setIsEditingTime(false);
        onPersistRef.current?.(seconds);
      },
    });
  }, [
    registerTimer,
    scheduleMinutes,
    timerKey,
    timerSession?.entityId,
    timerSession?.href,
    timerSession?.kind,
    timerSession?.statusKey,
    timerSession?.subtitle,
    timerSession?.title,
    trackedMinutes,
    usesGlobalTimer,
  ]);

  useEffect(() => {
    if (!usesGlobalTimer || !syncTimerDurationSeconds || !timerKey) return;
    syncTimerDurationSeconds(
      timerKey,
      effectiveTrackedDurationSeconds,
      trackedMinutes,
      scheduleMinutes,
    );
  }, [
    effectiveTrackedDurationSeconds,
    scheduleMinutes,
    syncTimerDurationSeconds,
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
      ? (trackedTimer!.getElapsedSeconds(timerKey) ?? 0)
      : getLocalElapsedSeconds();
  void timerTick;

  const pausedSeconds =
    !isRunning && timerElapsedSeconds > 0 ? timerElapsedSeconds : null;
  const settledSeconds =
    pendingSeconds ?? pausedSeconds ?? displaySeconds ?? 0;

  useEffect(() => {
    if (isRunning) {
      setIsEditingTime(false);
      return;
    }
    setDraft(formatTrackedTimeInput(settledSeconds));
  }, [isRunning, settledSeconds, timerTick]);

  useEffect(() => {
    if (usesGlobalTimer || !localRunning) return;
    const id = setInterval(() => setLocalTick((value) => value + 1), 1000);
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

  const handleToggleTimer = () => {
    if (!canEdit) return;
    if (usesGlobalTimer && timerKey) {
      trackedTimer!.toggleTimer(timerKey);
      return;
    }

    if (localRunning) {
      const totalSeconds = getLocalElapsedSeconds();
      sessionStartRef.current = null;
      setLocalRunning(false);
      const seconds = trackedDurationSecondsFromElapsed(totalSeconds);
      setDraft(formatTrackedTimeInput(seconds));
      if (onTimerSessionChangeRef.current) {
        onTimerSessionChangeRef.current("pause", seconds);
      } else {
        onTrackedDurationSecondsChange?.(seconds);
      }
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
  };

  const shownSeconds = isRunning ? timerElapsedSeconds : settledSeconds;
  const inputValue = draft.trim()
    ? draft
    : formatTrackedTimeInput(settledSeconds);

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

  const toggleButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isRunning ? "Pause timer" : "Start timer"}
      disabled={!canEdit}
      onPress={handleToggleTimer}
      style={({ pressed }) => [
        styles.toggle,
        isRunning ? styles.toggleRunning : null,
        pressed && canEdit ? styles.togglePressed : null,
        !canEdit ? styles.toggleDisabled : null,
      ]}
    >
      {isRunning ? <PauseIcon /> : <PlayIcon />}
    </Pressable>
  );

  const timeControl = isRunning ? (
    <Text
      style={[styles.timeText, styles.timeTextLive]}
      accessibilityLabel={`${label}, running`}
    >
      {formatTrackedTimeInput(shownSeconds) || "00:00:00"}
    </Text>
  ) : isEditingTime && canEdit ? (
    <TextInput
      value={inputValue}
      onChangeText={setDraft}
      onBlur={() => {
        commit(draft);
        setIsEditingTime(false);
      }}
      onSubmitEditing={() => {
        commit(draft);
        setIsEditingTime(false);
      }}
      placeholder="00:00:00"
      keyboardType="numbers-and-punctuation"
      autoFocus
      style={styles.timeInput}
      accessibilityLabel={label}
    />
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!canEdit}
      onPress={() => {
        if (!canEdit) return;
        setIsEditingTime(true);
      }}
      style={({ pressed }) => [
        styles.timePressable,
        pressed && canEdit ? styles.timePressed : null,
      ]}
    >
      <Text style={styles.timeText}>
        {formatTrackedTimeInput(shownSeconds) || "00:00:00"}
      </Text>
    </Pressable>
  );

  if (variant === "pill") {
    return (
      <View style={[styles.pillWrap, style]}>
        <View style={[styles.pill, isRunning ? styles.pillRunning : null]}>
          {toggleButton}
          {timeControl}
        </View>
        {derivedHint ? (
          <Text style={styles.hint}>{derivedHint}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.propertyWrap, style]}>
      <Text style={styles.propertyLabel}>{label}</Text>
      <View style={[styles.propertyRow, isRunning ? styles.pillRunning : null]}>
        {toggleButton}
        {timeControl}
      </View>
      {derivedHint ? <Text style={styles.hint}>{derivedHint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pillWrap: {
    gap: 4,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillRunning: {
    borderColor: "#52a450",
  },
  propertyWrap: {
    gap: 6,
    paddingVertical: 8,
  },
  propertyLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  propertyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignSelf: "flex-start",
  },
  toggle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.rowPressed,
  },
  toggleRunning: {
    backgroundColor: "#52a45033",
  },
  togglePressed: {
    opacity: 0.8,
  },
  toggleDisabled: {
    opacity: 0.4,
  },
  playIcon: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  playTriangle: {
    width: 0,
    height: 0,
    marginLeft: 2,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 7,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: colors.foreground,
  },
  pauseIcon: {
    flexDirection: "row",
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseBar: {
    width: 2.5,
    height: 8,
    borderRadius: 1,
    backgroundColor: colors.foreground,
  },
  timeText: {
    color: colors.foreground,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
    minWidth: 72,
    textAlign: "center",
  },
  timeTextLive: {
    color: "#52a450",
  },
  timeInput: {
    minWidth: 88,
    color: colors.foreground,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
    paddingVertical: 0,
    paddingHorizontal: 4,
    textAlign: "center",
  },
  timePressable: {
    minWidth: 72,
    paddingHorizontal: 4,
  },
  timePressed: {
    opacity: 0.75,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
  },
});
