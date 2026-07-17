export interface WhoopSleepStagesSummary {
  remMs?: number | null;
  remPct?: number | null;
  lightMs?: number | null;
  lightPct?: number | null;
  swsMs?: number | null;
  swsPct?: number | null;
  wakeMs?: number | null;
  wakePct?: number | null;
}

export type WhoopSleepStage = "AWAKE" | "LIGHT" | "REM" | "SWS";

export interface WhoopSleepHypnogramSegment {
  startedAt: string;
  endedAt: string;
  stage: WhoopSleepStage;
}

export interface WhoopStrainTarget {
  value?: number | null;
  optimalLower?: number | null;
  optimalUpper?: number | null;
}

export interface WhoopHrZoneDurations {
  zone0Ms?: number | null;
  zone1Ms?: number | null;
  zone2Ms?: number | null;
  zone3Ms?: number | null;
  zone4Ms?: number | null;
  zone5Ms?: number | null;
}

export interface WhoopWorkoutEntity {
  id: string;
  sportName: string;
  sportId?: number;
  start: string;
  end: string;
  duration?: string;
  strain?: number | null;
  avgHrBpm?: number | null;
  maxHrBpm?: number | null;
  calories?: number | null;
  distanceM?: number | null;
}

export interface WhoopSnapshotEntity {
  id: string;
  date: string;
  recoveryScore?: number | null;
  recoveryState?: "GREEN" | "YELLOW" | "RED" | null;
  hrvMs?: number | null;
  rhrBpm?: number | null;
  sleepPerformance?: number | null;
  sleepDuration?: string;
  strainScore?: number | null;
  workoutsCount?: number;
  strainTarget?: WhoopStrainTarget;
  strainCalories?: number | null;
  strainAvgHrBpm?: number | null;
  strainMaxHrBpm?: number | null;
  strainZoneDurations?: WhoopHrZoneDurations;
  steps?: number | null;
  strengthActivityTime?: string;
  workouts?: WhoopWorkoutEntity[];
  sleepStartedAt?: string | null;
  sleepEndedAt?: string | null;
  timeInBed?: string;
  sleepEfficiencyPct?: number | null;
  sleepConsistencyPct?: number | null;
  sleepStages?: WhoopSleepStagesSummary;
  sleepHypnogram?: WhoopSleepHypnogramSegment[];
  disturbances?: number | null;
  sleepHrAvgBpm?: number | null;
  sleepHrMinBpm?: number | null;
}

export type WhoopSnapshotsPayload = {
  type: "whoop_snapshots";
  items: WhoopSnapshotEntity[];
};

export type WhoopDayApiResponse = {
  authenticated: boolean;
  snapshot: WhoopSnapshotEntity | null;
  error?: string;
};
