import type { WhoopWorkoutEntity } from "@/lib/whoop/types";

export type TotemTokenManager = new (options: {
  email: string;
  accessToken: string;
  refreshToken: string;
  envPath: string;
}) => {
  getToken(): Promise<string>;
};

export type TotemWhoopClient = new (options: {
  getToken: () => Promise<string>;
}) => {
  get(path: string, params?: Record<string, string>): Promise<unknown>;
};

export type TotemWorkoutListItem = {
  id: string;
  sport_name: string;
  start: string;
  end: string;
  duration_ms?: number;
  strain?: number;
  avg_hr_bpm?: number;
  max_hr_bpm?: number;
  calories?: number;
  distance_m?: number;
};

export type TotemWhoopModules = {
  TokenManager: TotemTokenManager;
  WhoopClient: TotemWhoopClient;
  projectToday: (input: Record<string, unknown>) => unknown;
  projectSleep: (raw: unknown, date: string) => unknown;
  projectStrain: (raw: unknown, date: string) => unknown;
  projectWorkoutsList: (
    raw: unknown,
    date?: string,
    limit?: number,
  ) => TotemWorkoutListItem[];
  projectWorkout: (
    raw: unknown,
    workoutId: string,
  ) => {
    sport_name?: string;
    strain?: number;
    avg_hr_bpm?: number;
    max_hr_bpm?: number;
    calories?: number;
    duration_ms?: number;
  };
};

export type TotemWhoopClientInstance = InstanceType<TotemWhoopClient>;

export type { WhoopWorkoutEntity };
