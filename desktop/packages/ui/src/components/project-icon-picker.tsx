"use client";

import { DefaultProjectIcon } from "./default-project-icon.js";
import { EntityIconPicker } from "./entity-icon-picker.js";

export type ProjectIconPickerProps = {
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
        preview: <DefaultProjectIcon size={16} />,
      }}
    />
  );
}
