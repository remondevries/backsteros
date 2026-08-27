import { Alert } from "react-native";

import type { SoftDeletableEntityTable } from "./entity-mutations";

export type EntitySoftDeleteKind = Exclude<
  SoftDeletableEntityTable,
  "areas"
>;

const ENTITY_KIND_LABELS: Record<EntitySoftDeleteKind, string> = {
  tasks: "task",
  projects: "project",
  letters: "letter",
  contacts: "contact",
  organizations: "organization",
  documents: "document",
};

export function confirmEntitySoftDelete(
  kind: EntitySoftDeleteKind,
  displayName: string,
  onConfirm: () => void | Promise<void>,
): void {
  const entityLabel = ENTITY_KIND_LABELS[kind];
  const trimmed = displayName.trim();
  const message = trimmed
    ? `${trimmed}\n\nThis action cannot be undone.`
    : "This action cannot be undone.";

  Alert.alert(`Delete ${entityLabel}?`, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: () => {
        void Promise.resolve(onConfirm()).catch((reason) => {
          Alert.alert(
            `Could not delete ${entityLabel}`,
            reason instanceof Error ? reason.message : String(reason),
          );
        });
      },
    },
  ]);
}
