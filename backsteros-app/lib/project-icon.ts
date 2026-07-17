import type { ComponentType } from "react";

import {
  PROJECT_ICON_KEYS,
  type ProjectIconKey,
} from "@/lib/project-icon-keys";

export const DEFAULT_PROJECT_ICON = "default";

export type { ProjectIconKey } from "@/lib/project-icon-keys";
export { PROJECT_ICON_KEYS };

export type ProjectOcticonProps = import("@/lib/project-octicon-registry").ProjectOcticonProps;

const PROJECT_ICON_KEY_SET = new Set<string>(PROJECT_ICON_KEYS);

export function isProjectIconKey(value: string): value is ProjectIconKey {
  return PROJECT_ICON_KEY_SET.has(value);
}

export function normalizeProjectIconKey(
  value: string | null | undefined,
): ProjectIconKey | typeof DEFAULT_PROJECT_ICON {
  const trimmed = value?.trim();
  if (trimmed && isProjectIconKey(trimmed)) {
    return trimmed;
  }

  return DEFAULT_PROJECT_ICON;
}

export function formatProjectIconLabel(key: ProjectIconKey): string {
  return key.replaceAll("-", " ");
}

type RegistryModule = typeof import("@/lib/project-octicon-registry");

let registryPromise: Promise<RegistryModule> | null = null;

function loadOcticonRegistry(): Promise<RegistryModule> {
  if (!registryPromise) {
    registryPromise = import("@/lib/project-octicon-registry");
  }
  return registryPromise;
}

const componentCache = new Map<ProjectIconKey, ComponentType<ProjectOcticonProps>>();

export async function loadProjectOcticonComponent(
  key: ProjectIconKey,
): Promise<ComponentType<ProjectOcticonProps> | null> {
  const cached = componentCache.get(key);
  if (cached) {
    return cached;
  }

  const registry = await loadOcticonRegistry();
  const component = registry.getOcticonComponent(key);
  if (component) {
    componentCache.set(key, component);
  }
  return component;
}

export function getProjectOcticonComponent(
  key: string,
): ComponentType<ProjectOcticonProps> | null {
  if (!isProjectIconKey(key)) {
    return null;
  }

  const cached = componentCache.get(key);
  if (cached) {
    return cached;
  }

  void loadProjectOcticonComponent(key);
  return null;
}
