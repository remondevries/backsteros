import { getTotemEnvPath, getWhoopEnv, isWhoopAuthenticated } from "@/lib/whoop/config";
import { formatDateInTimezone, resolveDailyNoteInfo } from "@/lib/whoop/dates";
import {
  attachWhoopSleepDeepDive,
  attachWhoopStrainDeepDive,
  attachWhoopWorkoutEntities,
  enrichWhoopResult,
  enrichWhoopWorkoutsWithDetails,
  parseWorkoutEntity,
} from "@/lib/whoop/enrich";
import { loadTotemWhoopModules } from "@/lib/whoop/load-totem-modules";
import type { TotemWorkoutListItem } from "@/lib/whoop/totem-types";
import type { WhoopSnapshotEntity } from "@/lib/whoop/types";

export async function fetchWhoopDaySnapshotCore(
  options: {
    timezone?: string;
    now?: Date;
    includeStrainDeepDive?: boolean;
    date?: string;
  } = {},
): Promise<WhoopSnapshotEntity | null> {
  if (!isWhoopAuthenticated()) {
    throw new Error("Whoop is not authenticated");
  }

  const env = getWhoopEnv();
  const email = env.WHOOP_EMAIL;
  const accessToken = env.WHOOP_IOS_BEARER_TOKEN;
  const refreshToken = env.WHOOP_COGNITO_REFRESH_TOKEN;

  if (!email || !accessToken || !refreshToken) {
    throw new Error("Whoop tokens are incomplete in totem.env");
  }

  const {
    TokenManager,
    WhoopClient,
    projectToday,
    projectSleep,
    projectStrain,
    projectWorkoutsList,
  } = await loadTotemWhoopModules();

  const resolved = resolveDailyNoteInfo({
    timezone: options.timezone,
    now: options.now,
    date: options.date,
  });
  const info = resolved;

  const tokenManager = new TokenManager({
    email,
    accessToken,
    refreshToken,
    envPath: getTotemEnvPath(),
  });
  const client = new WhoopClient({ getToken: () => tokenManager.getToken() });

  const includeStrainDeepDive = options.includeStrainDeepDive ?? false;

  function workoutLocalDate(iso: string): string {
    return formatDateInTimezone(info.timezone, new Date(iso));
  }

  function isRecentWorkout(iso: string): boolean {
    const localDate = workoutLocalDate(iso);
    if (localDate === info.date) {
      return true;
    }
    const ageMs = Date.now() - new Date(iso).getTime();
    return ageMs >= 0 && ageMs <= 36 * 60 * 60 * 1000;
  }

  const [home, sleep, recovery, state, sleepDeepRaw, strainRaw, workoutsRaw] =
    await Promise.all([
      client.get("/home-service/v1/home", { date: info.date }),
      client.get("/developer/v2/activity/sleep", { limit: "5" }).catch(() => null),
      client.get("/developer/v2/recovery", { limit: "5" }).catch(() => null),
      client.get("/activities-service/v1/user-state").catch(() => null),
      client
        .get("/home-service/v1/deep-dive/sleep/last-night", { date: info.date })
        .catch(() => null),
      includeStrainDeepDive
        ? client.get("/home-service/v1/deep-dive/strain", { date: info.date }).catch(() => null)
        : Promise.resolve(null),
      includeStrainDeepDive
        ? client
            .get("/developer/v2/activity/workout", {
              start: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              end: new Date().toISOString(),
              limit: "25",
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

  const projected = projectToday({ home, sleep, recovery, state, date: info.date });
  const structured = await enrichWhoopResult(projected, "whoop_today");
  if (structured?.type !== "whoop_snapshots" || structured.items.length === 0) {
    return null;
  }

  const snapshot = structured.items[0] ?? null;
  if (!snapshot) {
    return null;
  }

  let enriched = snapshot;

  if (sleepDeepRaw) {
    const sleepDeep = projectSleep(sleepDeepRaw, info.date);
    enriched = attachWhoopSleepDeepDive(enriched, sleepDeep as Record<string, unknown>);
  }

  if (includeStrainDeepDive && strainRaw) {
    const strainDeep = projectStrain(strainRaw, info.date);
    enriched = attachWhoopStrainDeepDive(enriched, strainDeep as Record<string, unknown>);
  }

  if (includeStrainDeepDive && workoutsRaw) {
    const rawRecords = Array.isArray((workoutsRaw as { records?: unknown }).records)
      ? ((workoutsRaw as { records: Record<string, unknown>[] }).records ?? [])
      : [];
    const sportIdByWorkoutId = new Map<string, number | null>(
      rawRecords
        .filter((record) => typeof record.id === "string")
        .map((record) => [
          record.id as string,
          typeof record.sport_id === "number" ? record.sport_id : null,
        ]),
    );

    const listed = projectWorkoutsList(workoutsRaw, undefined, 25).filter(
      (workout: TotemWorkoutListItem) => isRecentWorkout(workout.start),
    );

    const parsed = listed
      .map((workout: TotemWorkoutListItem) =>
        parseWorkoutEntity({
          id: workout.id,
          sport_name: workout.sport_name,
          sport_id: sportIdByWorkoutId.get(workout.id) ?? undefined,
          start: workout.start,
          end: workout.end,
          duration_ms: workout.duration_ms,
          strain: workout.strain,
          avg_hr_bpm: workout.avg_hr_bpm,
          max_hr_bpm: workout.max_hr_bpm,
          calories: workout.calories,
          distance_m: workout.distance_m,
        }),
      )
      .filter((workout): workout is NonNullable<typeof workout> => workout != null);

    const detailed = await enrichWhoopWorkoutsWithDetails(client, parsed);
    enriched = attachWhoopWorkoutEntities(enriched, detailed);
  }

  return enriched;
}
