import { HabitTrackerPage } from "./habit-tracker-page";

/**
 * TEMP Habit Tracker v2 bisect: same content as Habit Tracker on `/habits-v2`
 * (+ `/$habitId`), with its own keep-alive surface.
 */
export function HabitTrackerV2Page() {
  return <HabitTrackerPage />;
}
