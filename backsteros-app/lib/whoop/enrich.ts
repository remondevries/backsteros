import { loadTotemWhoopModules } from "@/lib/whoop/load-totem-modules";
import type {
  WhoopHrZoneDurations,
  WhoopSleepHypnogramSegment,
  WhoopSleepStagesSummary,
  WhoopSnapshotEntity,
  WhoopSnapshotsPayload,
  WhoopStrainTarget,
  WhoopWorkoutEntity,
} from "@/lib/whoop/types";

type RecoveryState = "GREEN" | "YELLOW" | "RED";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function parseMcpContentItems(content: unknown, payloads: unknown[]): void {
  if (!Array.isArray(content)) return;

  for (const item of content) {
    const itemRecord = asRecord(item);
    if (typeof itemRecord?.text === "string") {
      try {
        payloads.push(JSON.parse(itemRecord.text));
      } catch {
        payloads.push(itemRecord.text);
      }
      continue;
    }

    const textBlock = asRecord(itemRecord?.text);
    const innerText = textBlock?.text;
    if (typeof innerText === "string") {
      try {
        payloads.push(JSON.parse(innerText));
      } catch {
        payloads.push(innerText);
      }
    }
  }
}

function unwrapMcpPayload(result: unknown): unknown[] {
  const payloads: unknown[] = [];
  const record = asRecord(result);
  if (!record) return [result];

  if (record.status === "success" && record.value !== undefined) {
    const valueRecord = asRecord(record.value);
    parseMcpContentItems(valueRecord?.content, payloads);
    if (payloads.length === 0) {
      payloads.push(record.value);
    }
    return payloads;
  }

  parseMcpContentItems(record.content, payloads);
  if (payloads.length > 0) {
    return payloads;
  }

  return [result];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInt(value: unknown): number | null {
  const num = asNumber(value);
  return num == null ? null : Math.trunc(num);
}

function asRecoveryState(value: unknown): RecoveryState | null {
  return value === "GREEN" || value === "YELLOW" || value === "RED" ? value : null;
}

function formatDuration(ms: number | null | undefined): string | undefined {
  if (ms == null) return undefined;
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function parseSleepStages(value: unknown): WhoopSleepStagesSummary | undefined {
  const stages = asRecord(value);
  if (!stages) return undefined;

  return {
    remMs: asInt(stages.rem_ms),
    remPct: asNumber(stages.rem_pct),
    lightMs: asInt(stages.light_ms),
    lightPct: asNumber(stages.light_pct),
    swsMs: asInt(stages.sws_ms),
    swsPct: asNumber(stages.sws_pct),
    wakeMs: asInt(stages.wake_ms),
    wakePct: asNumber(stages.wake_pct),
  };
}

function parseTodaySnapshot(record: Record<string, unknown>): WhoopSnapshotEntity | null {
  const date = typeof record.date === "string" ? record.date : undefined;
  const recovery = asRecord(record.recovery);
  const sleep = asRecord(record.sleep);
  const strain = asRecord(record.strain);
  if (!date || !recovery || !sleep || !strain) return null;

  return {
    id: `whoop-${date}`,
    date,
    recoveryScore: asNumber(recovery.score),
    recoveryState: asRecoveryState(recovery.state),
    hrvMs: asNumber(recovery.hrv_ms),
    rhrBpm: asNumber(recovery.rhr_bpm),
    sleepPerformance: asNumber(sleep.performance_pct),
    sleepDuration: formatDuration(asInt(sleep.total_sleep_ms)),
    strainScore: asNumber(strain.score),
    workoutsCount: asInt(strain.workouts_count) ?? 0,
    sleepStartedAt: typeof sleep.started_at === "string" ? sleep.started_at : null,
    sleepEndedAt: typeof sleep.ended_at === "string" ? sleep.ended_at : null,
    timeInBed: formatDuration(asInt(sleep.time_in_bed_ms)),
    sleepEfficiencyPct: asNumber(sleep.efficiency_pct),
    sleepStages: parseSleepStages(sleep.stages),
  };
}

function parseRecoverySnapshot(record: Record<string, unknown>): WhoopSnapshotEntity | null {
  const date = typeof record.date === "string" ? record.date : undefined;
  if (!date) return null;

  const hrv = asRecord(record.hrv);
  const rhr = asRecord(record.rhr);

  return {
    id: `whoop-${date}`,
    date,
    recoveryScore: asNumber(record.score),
    recoveryState: asRecoveryState(record.state),
    hrvMs: asNumber(hrv?.ms),
    rhrBpm: asNumber(rhr?.bpm),
    sleepPerformance: asNumber(record.sleep_performance_pct),
  };
}

function parseStrainTarget(value: unknown): WhoopStrainTarget | undefined {
  const target = asRecord(value);
  if (!target) return undefined;

  return {
    value: asNumber(target.value),
    optimalLower: asNumber(target.optimal_lower),
    optimalUpper: asNumber(target.optimal_upper),
  };
}

function parseStrainZoneDurations(value: unknown): WhoopHrZoneDurations | undefined {
  const zones = asRecord(value);
  if (!zones) return undefined;

  return {
    zone0Ms: asInt(zones.zone_0_ms),
    zone1Ms: asInt(zones.zone_1_ms),
    zone2Ms: asInt(zones.zone_2_ms),
    zone3Ms: asInt(zones.zone_3_ms),
    zone4Ms: asInt(zones.zone_4_ms),
    zone5Ms: asInt(zones.zone_5_ms),
  };
}

function parseStrainFields(record: Record<string, unknown>): Partial<WhoopSnapshotEntity> {
  const target = parseStrainTarget(record.target);
  const zoneDurations = parseStrainZoneDurations(record.zone_durations);
  const strengthMs = asInt(record.strength_activity_time_ms);
  const workoutsCount = asInt(record.workouts_count);

  return {
    strainScore: asNumber(record.score),
    workoutsCount: workoutsCount == null ? undefined : workoutsCount,
    strainTarget: target,
    strainCalories: asInt(record.calories),
    strainAvgHrBpm: asNumber(record.avg_hr_bpm),
    strainMaxHrBpm: asNumber(record.max_hr_bpm),
    strainZoneDurations: zoneDurations,
    steps: asInt(record.steps),
    strengthActivityTime:
      strengthMs != null && strengthMs > 0 ? formatDuration(strengthMs) : undefined,
  };
}

export function parseWorkoutEntity(record: Record<string, unknown>): WhoopWorkoutEntity | null {
  const id = typeof record.id === "string" ? record.id : undefined;
  const rawSportName = typeof record.sport_name === "string" ? record.sport_name : undefined;
  const start = typeof record.start === "string" ? record.start : undefined;
  const end = typeof record.end === "string" ? record.end : undefined;
  if (!id || !rawSportName || !start || !end) return null;

  const sportId = asInt(record.sport_id);
  const sportName = resolveWorkoutSportName(rawSportName);

  return {
    id,
    sportName,
    sportId: sportId ?? undefined,
    start,
    end,
    duration: formatDuration(asInt(record.duration_ms)),
    strain: asNumber(record.strain),
    avgHrBpm: asNumber(record.avg_hr_bpm),
    maxHrBpm: asNumber(record.max_hr_bpm),
    calories: asInt(record.calories),
    distanceM: asNumber(record.distance_m),
  };
}

function resolveWorkoutSportName(sportName: string): string {
  return sportName;
}

function parseStrainSnapshot(record: Record<string, unknown>): WhoopSnapshotEntity | null {
  const date = typeof record.date === "string" ? record.date : undefined;
  if (!date) return null;

  return {
    id: `whoop-${date}`,
    date,
    ...parseStrainFields(record),
  };
}

function parseSleepSnapshot(record: Record<string, unknown>): WhoopSnapshotEntity | null {
  const date = typeof record.date === "string" ? record.date : undefined;
  if (!date) return null;

  return {
    id: `whoop-${date}`,
    date,
    sleepPerformance: asNumber(record.performance_pct),
    sleepDuration: formatDuration(asInt(record.total_sleep_ms)),
  };
}

function mergeSnapshots(
  existing: WhoopSnapshotEntity,
  incoming: WhoopSnapshotEntity,
): WhoopSnapshotEntity {
  return {
    ...existing,
    ...incoming,
    recoveryScore: incoming.recoveryScore ?? existing.recoveryScore,
    recoveryState: incoming.recoveryState ?? existing.recoveryState,
    hrvMs: incoming.hrvMs ?? existing.hrvMs,
    rhrBpm: incoming.rhrBpm ?? existing.rhrBpm,
    sleepPerformance: incoming.sleepPerformance ?? existing.sleepPerformance,
    sleepDuration: incoming.sleepDuration ?? existing.sleepDuration,
    strainScore: incoming.strainScore ?? existing.strainScore,
    workoutsCount: Math.max(
      existing.workoutsCount ?? 0,
      incoming.workoutsCount ?? 0,
      incoming.workouts?.length ?? existing.workouts?.length ?? 0,
    ),
    strainTarget: incoming.strainTarget ?? existing.strainTarget,
    strainCalories: incoming.strainCalories ?? existing.strainCalories,
    strainAvgHrBpm: incoming.strainAvgHrBpm ?? existing.strainAvgHrBpm,
    strainMaxHrBpm: incoming.strainMaxHrBpm ?? existing.strainMaxHrBpm,
    strainZoneDurations: incoming.strainZoneDurations ?? existing.strainZoneDurations,
    steps: incoming.steps ?? existing.steps,
    strengthActivityTime: incoming.strengthActivityTime ?? existing.strengthActivityTime,
    workouts: incoming.workouts && incoming.workouts.length > 0 ? incoming.workouts : existing.workouts,
    sleepStartedAt: incoming.sleepStartedAt ?? existing.sleepStartedAt,
    sleepEndedAt: incoming.sleepEndedAt ?? existing.sleepEndedAt,
    timeInBed: incoming.timeInBed ?? existing.timeInBed,
    sleepEfficiencyPct: incoming.sleepEfficiencyPct ?? existing.sleepEfficiencyPct,
    sleepConsistencyPct: incoming.sleepConsistencyPct ?? existing.sleepConsistencyPct,
    sleepStages: incoming.sleepStages ?? existing.sleepStages,
    sleepHypnogram: incoming.sleepHypnogram ?? existing.sleepHypnogram,
    disturbances: incoming.disturbances ?? existing.disturbances,
    sleepHrAvgBpm: incoming.sleepHrAvgBpm ?? existing.sleepHrAvgBpm,
    sleepHrMinBpm: incoming.sleepHrMinBpm ?? existing.sleepHrMinBpm,
  };
}

export function attachWhoopStrainDeepDive(
  snapshot: WhoopSnapshotEntity,
  strain: Record<string, unknown> | null,
): WhoopSnapshotEntity {
  if (!strain) return snapshot;

  const fields = parseStrainFields(strain);
  const workoutsCount = Math.max(
    snapshot.workoutsCount ?? 0,
    fields.workoutsCount ?? 0,
    snapshot.workouts?.length ?? 0,
  );

  return {
    ...snapshot,
    ...fields,
    strainScore: fields.strainScore ?? snapshot.strainScore,
    workoutsCount,
    strainTarget: fields.strainTarget ?? snapshot.strainTarget,
    strainZoneDurations: fields.strainZoneDurations ?? snapshot.strainZoneDurations,
    steps: fields.steps ?? snapshot.steps,
    strengthActivityTime: fields.strengthActivityTime ?? snapshot.strengthActivityTime,
  };
}

export function attachWhoopWorkouts(
  snapshot: WhoopSnapshotEntity,
  workouts: unknown,
): WhoopSnapshotEntity {
  if (!Array.isArray(workouts)) return snapshot;

  const parsed = workouts
    .map((item) =>
      typeof item === "object" && item != null && "sportName" in item
        ? (item as WhoopWorkoutEntity)
        : parseWorkoutEntity(asRecord(item) ?? {}),
    )
    .filter((item): item is WhoopWorkoutEntity => item != null);

  return attachWhoopWorkoutEntities(snapshot, parsed);
}

export function attachWhoopWorkoutEntities(
  snapshot: WhoopSnapshotEntity,
  workouts: WhoopWorkoutEntity[],
): WhoopSnapshotEntity {
  if (workouts.length === 0) return snapshot;

  return {
    ...snapshot,
    workouts,
    workoutsCount: Math.max(snapshot.workoutsCount ?? 0, workouts.length),
  };
}

export async function enrichWhoopWorkoutsWithDetails(
  client: { get: (path: string, params?: Record<string, string>) => Promise<unknown> },
  workouts: WhoopWorkoutEntity[],
): Promise<WhoopWorkoutEntity[]> {
  if (workouts.length === 0) return workouts;

  const { projectWorkout } = await loadTotemWhoopModules();

  return Promise.all(
    workouts.map(async (workout) => {
      try {
        const raw = await client.get("/core-details-bff/v1/cardio-details", {
          activityId: workout.id,
        });
        const detail = projectWorkout(raw, workout.id);
        const detailName = detail.sport_name?.trim();
        const sportName =
          detailName && !isGenericWhoopSportName(detailName)
            ? detailName
            : workout.sportName;

        return {
          ...workout,
          sportName: resolveWorkoutSportName(sportName),
          strain: detail.strain ?? workout.strain,
          avgHrBpm: detail.avg_hr_bpm ?? workout.avgHrBpm,
          maxHrBpm: detail.max_hr_bpm ?? workout.maxHrBpm,
          calories: detail.calories ?? workout.calories,
          duration:
            detail.duration_ms != null
              ? formatDuration(detail.duration_ms)
              : workout.duration,
        };
      } catch {
        return workout;
      }
    }),
  );
}

function isGenericWhoopSportName(name: string): boolean {
  return name.trim().toLowerCase() === "activity";
}

export function attachWhoopSleepDeepDive(
  snapshot: WhoopSnapshotEntity,
  sleep: Record<string, unknown> | null,
): WhoopSnapshotEntity {
  if (!sleep) return snapshot;

  const hypnogram = Array.isArray(sleep.hypnogram)
    ? sleep.hypnogram
        .map((segment): WhoopSleepHypnogramSegment | null => {
          const record = asRecord(segment);
          if (!record) return null;
          const stage = record.stage;
          if (stage !== "AWAKE" && stage !== "LIGHT" && stage !== "REM" && stage !== "SWS") {
            return null;
          }
          const startedAt = typeof record.started_at === "string" ? record.started_at : null;
          const endedAt = typeof record.ended_at === "string" ? record.ended_at : null;
          if (!startedAt || !endedAt) return null;
          return { startedAt, endedAt, stage };
        })
        .filter((segment): segment is WhoopSleepHypnogramSegment => segment != null)
    : undefined;

  const sleepHr = asRecord(sleep.sleep_hr);

  return {
    ...snapshot,
    sleepStartedAt: snapshot.sleepStartedAt ?? (typeof sleep.started_at === "string" ? sleep.started_at : null),
    sleepEndedAt: snapshot.sleepEndedAt ?? (typeof sleep.ended_at === "string" ? sleep.ended_at : null),
    sleepDuration: snapshot.sleepDuration ?? formatDuration(asInt(sleep.total_sleep_ms)),
    timeInBed: snapshot.timeInBed ?? formatDuration(asInt(sleep.time_in_bed_ms)),
    sleepEfficiencyPct: snapshot.sleepEfficiencyPct ?? asNumber(sleep.efficiency_pct),
    sleepConsistencyPct: asNumber(sleep.consistency_pct) ?? snapshot.sleepConsistencyPct,
    sleepPerformance: snapshot.sleepPerformance ?? asNumber(sleep.performance_pct),
    sleepStages: parseSleepStages(sleep.stages) ?? snapshot.sleepStages,
    sleepHypnogram: hypnogram && hypnogram.length > 0 ? hypnogram : snapshot.sleepHypnogram,
    disturbances: asInt(sleep.disturbances) ?? snapshot.disturbances,
    sleepHrAvgBpm: asNumber(sleepHr?.avg_bpm) ?? snapshot.sleepHrAvgBpm,
    sleepHrMinBpm: asNumber(sleepHr?.min_bpm) ?? snapshot.sleepHrMinBpm,
  };
}

function resolveWhoopToolName(toolName: string, args?: unknown): string {
  const argsObj = asRecord(args);
  const nested = asRecord(argsObj?.args);
  const innerTool =
    (typeof argsObj?.toolName === "string" ? argsObj.toolName : undefined) ??
    (typeof nested?.toolName === "string" ? nested.toolName : undefined);
  return (innerTool ?? toolName).toLowerCase();
}

function parseWhoopPayload(
  record: Record<string, unknown>,
  effectiveToolName: string,
): WhoopSnapshotEntity | null {
  if (effectiveToolName.includes("whoop_today") || effectiveToolName.includes("whoop_day")) {
    return parseTodaySnapshot(record);
  }
  if (effectiveToolName.includes("whoop_recovery")) {
    return parseRecoverySnapshot(record);
  }
  if (effectiveToolName.includes("whoop_strain")) {
    return parseStrainSnapshot(record);
  }
  if (effectiveToolName.includes("whoop_sleep")) {
    return parseSleepSnapshot(record);
  }

  return (
    parseTodaySnapshot(record) ??
    parseRecoverySnapshot(record) ??
    parseStrainSnapshot(record) ??
    parseSleepSnapshot(record)
  );
}

export function enrichWhoopResult(
  result: unknown,
  toolName: string,
  args?: unknown,
): WhoopSnapshotsPayload | undefined {
  const effectiveToolName = resolveWhoopToolName(toolName, args);
  const merged = new Map<string, WhoopSnapshotEntity>();

  for (const payload of unwrapMcpPayload(result)) {
    const record = asRecord(payload);
    if (!record) continue;

    const snapshot = parseWhoopPayload(record, effectiveToolName);
    if (!snapshot) continue;

    const previous = merged.get(snapshot.id);
    merged.set(snapshot.id, previous ? mergeSnapshots(previous, snapshot) : snapshot);
  }

  if (merged.size === 0) return undefined;

  return { type: "whoop_snapshots", items: [...merged.values()] };
}
