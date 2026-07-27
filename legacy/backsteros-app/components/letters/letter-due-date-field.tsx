"use client";

import { LetterDueDateDropdown } from "./letter-due-date-dropdown";

type LetterDueDateFieldProps = {
  letterId: string;
  projectId: string | null;
  dueDate: Date | null;
  status?: string | null;
};

export function LetterDueDateField({
  letterId,
  projectId,
  dueDate,
  status,
}: LetterDueDateFieldProps) {
  return (
    <LetterDueDateDropdown
      letterId={letterId}
      projectId={projectId}
      dueDate={dueDate}
      status={status}
      variant="property"
    />
  );
}
