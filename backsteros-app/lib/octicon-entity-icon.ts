import {
  getProjectOcticonComponent,
  type ProjectIconKey,
} from "@/lib/project-icon";

export function getDisplayOcticonKey(
  icon: string | null | undefined,
): ProjectIconKey | null {
  const trimmed = icon?.trim();
  if (!trimmed || !getProjectOcticonComponent(trimmed)) {
    return null;
  }

  return trimmed as ProjectIconKey;
}
