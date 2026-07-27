import type { ReactNode } from "react";

type OverviewDetailsFieldProps = {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  error?: string | null;
};

export const overviewDetailsInputClassName =
  "w-full min-w-0 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-white/20 disabled:opacity-60";

export function OverviewDetailsField({
  label,
  htmlFor,
  children,
  error,
}: OverviewDetailsFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-start gap-3 max-md:flex-col max-md:gap-1.5">
        <label
          htmlFor={htmlFor}
          className="w-[108px] shrink-0 pt-1.5 text-sm text-foreground/50 max-md:w-auto max-md:pt-0"
        >
          {label}
        </label>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {error ? (
        <p className="pl-[120px] text-xs text-red-400 max-md:pl-0" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
