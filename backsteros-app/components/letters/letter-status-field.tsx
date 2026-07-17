"use client";

import { LetterStatusDropdown } from "./letter-status-dropdown";

type LetterStatusFieldProps = {
  letterId: string;
  projectId: string | null;
  status: string;
};

export function LetterStatusField({
  letterId,
  projectId,
  status,
}: LetterStatusFieldProps) {
  return (
    <LetterStatusDropdown
      letterId={letterId}
      projectId={projectId}
      status={status}
      variant="property"
    />
  );
}
