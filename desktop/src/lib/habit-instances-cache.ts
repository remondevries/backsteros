import type { Habit } from "@backsteros/contracts";
import type { HabitGridInstance, HabitListItem } from "@backsteros/ui";

let gridInstances: HabitGridInstance[] = [];
let panelItems: HabitListItem[] = [];

export function peekHabitGridInstances(): HabitGridInstance[] {
  return gridInstances;
}

export function writeHabitGridInstances(next: HabitGridInstance[]): void {
  gridInstances = next;
}

export function peekHabitPanelItems(): HabitListItem[] {
  return panelItems;
}

export function writeHabitPanelItems(next: HabitListItem[]): void {
  panelItems = next;
}

/** First-paint side-panel rows from the habits slice — no allTasks scan. */
export function habitPanelItemsFromHabits(
  habits: readonly Habit[],
): HabitListItem[] {
  if (panelItems.length > 0) return panelItems;
  return habits.map((habit) => ({
    ...habit,
    checked: false,
    todayTaskId: null,
  }));
}
