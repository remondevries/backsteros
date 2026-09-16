import type { ContextMenuItem } from "@t3tools/contracts";

import { buildComposerColorMenuItems } from "../components/threadActionMenu.logic";

export type BacksterosTaskActionMenuId =
  | "color"
  | `color:${string}`
  | "color:clear"
  | "pin"
  | "unpin"
  | "snooze"
  | `snooze:${string}`
  | "unsnooze"
  | "mark-unread"
  | "copy"
  | "copy-path"
  | "copy-task-id"
  | "delete";

export type BacksterosTaskActionMenuState = {
  readonly hasLinkedThread: boolean;
  readonly isPinned: boolean;
  readonly isSnoozed: boolean;
  readonly canSnoozeNow: boolean;
  readonly supportsPinning: boolean;
  readonly supportsSnooze: boolean;
  readonly hasWorkspacePath: boolean;
  readonly currentAccentColor?: string | null;
  readonly snoozePresets: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly whenLabel: string;
  }>;
};

/**
 * Right-click menu for BacksterOS task rows. Pin/snooze/unread need a linked
 * T3 chat; color, copy, and delete always work.
 */
export function buildBacksterosTaskActionMenuItems(
  state: BacksterosTaskActionMenuState,
): ReadonlyArray<ContextMenuItem<BacksterosTaskActionMenuId>> {
  const threadActionsEnabled = state.hasLinkedThread;
  return [
    {
      id: "color",
      label: "Color",
      icon: "palette",
      children: buildComposerColorMenuItems({
        currentAccentColor: state.currentAccentColor,
        includeClear: true,
      }),
    },
    ...(state.supportsPinning
      ? [
          state.isPinned
            ? {
                id: "unpin" as const,
                label: "Unpin thread",
                icon: "pin-off",
                disabled: !threadActionsEnabled,
              }
            : {
                id: "pin" as const,
                label: "Pin thread",
                icon: "pin",
                disabled: !threadActionsEnabled,
              },
        ]
      : []),
    ...(state.supportsSnooze
      ? [
          state.isSnoozed
            ? {
                id: "unsnooze" as const,
                label: "Wake thread",
                icon: "clock",
                disabled: !threadActionsEnabled,
              }
            : {
                id: "snooze" as const,
                label: "Snooze",
                icon: "clock",
                disabled: !threadActionsEnabled || !state.canSnoozeNow,
                children: state.snoozePresets.map((preset) => ({
                  id: `snooze:${preset.id}` as const,
                  label: `${preset.label} (${preset.whenLabel})`,
                })),
              },
        ]
      : []),
    {
      id: "mark-unread",
      label: "Mark unread",
      icon: "mail-open",
      disabled: !threadActionsEnabled,
    },
    {
      id: "copy",
      label: "Copy",
      icon: "copy",
      separatorBefore: true,
      children: [
        {
          id: "copy-path",
          label: "Path",
          icon: "folder",
          disabled: !state.hasWorkspacePath,
        },
        { id: "copy-task-id", label: "Task ID", icon: "hash" },
      ],
    },
    {
      id: "delete",
      label: "Delete",
      destructive: true,
      icon: "trash",
      separatorBefore: true,
    },
  ];
}
