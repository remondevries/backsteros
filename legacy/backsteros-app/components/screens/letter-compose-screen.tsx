"use client";

import { LetterComposeView } from "@/components/letters/letter-compose-view";

/** Circle `/letters/new` — create letter with notes + properties panel. */
export function LetterComposeScreen() {
  return <LetterComposeView useSearchParamsDefaults />;
}
