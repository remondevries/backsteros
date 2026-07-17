import { importTotemModule } from "@/lib/whoop/totem-runtime";
import type { TotemWhoopModules } from "@/lib/whoop/totem-types";

let modulesPromise: Promise<TotemWhoopModules> | null = null;

export function loadTotemWhoopModules(): Promise<TotemWhoopModules> {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      importTotemModule<{ TokenManager: TotemWhoopModules["TokenManager"] }>(
        "whoop",
        "token_manager.js",
      ),
      importTotemModule<{ WhoopClient: TotemWhoopModules["WhoopClient"] }>(
        "whoop",
        "client.js",
      ),
      importTotemModule<{ projectToday: TotemWhoopModules["projectToday"] }>(
        "projections",
        "today.js",
      ),
      importTotemModule<{ projectSleep: TotemWhoopModules["projectSleep"] }>(
        "projections",
        "sleep.js",
      ),
      importTotemModule<{ projectStrain: TotemWhoopModules["projectStrain"] }>(
        "projections",
        "strain.js",
      ),
      importTotemModule<{
        projectWorkoutsList: TotemWhoopModules["projectWorkoutsList"];
      }>("projections", "workouts.js"),
      importTotemModule<{ projectWorkout: TotemWhoopModules["projectWorkout"] }>(
        "projections",
        "workout.js",
      ),
    ]).then(
      ([
        tokenManagerModule,
        clientModule,
        todayModule,
        sleepModule,
        strainModule,
        workoutsModule,
        workoutModule,
      ]) => ({
        TokenManager: tokenManagerModule.TokenManager,
        WhoopClient: clientModule.WhoopClient,
        projectToday: todayModule.projectToday,
        projectSleep: sleepModule.projectSleep,
        projectStrain: strainModule.projectStrain,
        projectWorkoutsList: workoutsModule.projectWorkoutsList,
        projectWorkout: workoutModule.projectWorkout,
      }),
    );
  }

  return modulesPromise;
}
