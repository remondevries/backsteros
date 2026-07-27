"use client";

import { LetterOcticon } from "@/components/letters/letter-octicon";

type LetterDetailIconProps = {
  icon: string | null | undefined;
  title: string;
};

/** Display-only letter icon matching Circle's detail header affordance. */
export function LetterDetailIcon({ icon, title }: LetterDetailIconProps) {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border-[0.5px] border-white/10 bg-white/5 text-foreground"
      aria-hidden="true"
      title={title}
    >
      <LetterOcticon icon={icon} size={16} className="text-foreground/85" />
    </span>
  );
}
