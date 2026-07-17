"use client";

import { EntityIconPicker } from "@/components/icons/entity-icon-picker";
import { DefaultProjectIcon } from "@/components/project-icon";

type ProjectIconPickerProps = {
  open: boolean;
  value: string | null;
  onClose: () => void;
  onSelect: (icon: string | null) => void;
};

export function ProjectIconPicker({
  open,
  value,
  onClose,
  onSelect,
}: ProjectIconPickerProps) {
  return (
    <EntityIconPicker
      open={open}
      value={value}
      dialogTitle="Choose project icon"
      onClose={onClose}
      onSelect={onSelect}
      defaultOption={{
        label: "Default project icon",
        preview: <DefaultProjectIcon className="size-4 text-current" />,
      }}
    />
  );
}
