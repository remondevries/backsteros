/** Calendar YMD helpers for habit day squares. */

export function getTaskDueDateYmd(
  dueDate: Date | number | string | null | undefined,
): string | null {
  if (dueDate == null) return null;
  if (typeof dueDate === "string") {
    const trimmed = dueDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return null;
    return formatLocalYmd(date);
  }
  const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  return formatLocalYmd(date);
}

function formatLocalYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
