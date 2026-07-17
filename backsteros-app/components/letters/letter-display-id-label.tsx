import { getLetterDisplayId } from "@/lib/letter-display-id";
import type { Letter } from "@/lib/db/schema";

type LetterDisplayIdLabelProps = {
  letter: Pick<Letter, "number">;
  className?: string;
};

export function LetterDisplayIdLabel({
  letter,
  className = "shrink-0 font-mono text-xs tabular-nums text-foreground/45",
}: LetterDisplayIdLabelProps) {
  const displayId = getLetterDisplayId(letter);

  if (!displayId) {
    return null;
  }

  return <span className={className}>{displayId}</span>;
}
