"use client";

import { LetterReceivedDateDropdown } from "./letter-received-date-dropdown";

type LetterReceivedDateFieldProps = {
  letterId: string;
  projectId: string | null;
  receivedDate: Date | null;
};

export function LetterReceivedDateField({
  letterId,
  projectId,
  receivedDate,
}: LetterReceivedDateFieldProps) {
  return (
    <LetterReceivedDateDropdown
      letterId={letterId}
      projectId={projectId}
      receivedDate={receivedDate}
      variant="property"
    />
  );
}
