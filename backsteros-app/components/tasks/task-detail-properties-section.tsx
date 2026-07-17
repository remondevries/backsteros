import type { ReactNode } from "react";

type TaskDetailPropertiesSectionProps = {
  title: string;
  children: ReactNode;
};

export function TaskDetailPropertiesSection({
  title,
  children,
}: TaskDetailPropertiesSectionProps) {
  return (
    <section className="flex flex-col gap-2.5 rounded-[10px] border-[0.5px] border-white/10 bg-white/[0.03] px-2.5 py-3">
      <header className="flex items-center gap-1 px-2">
        <h3 className="text-xs font-medium leading-snug text-foreground/50">
          {title}
        </h3>
        <span aria-hidden="true" className="text-[10px] text-foreground/50">
          ▾
        </span>
      </header>
      <div className="flex flex-col gap-2 px-1.5">{children}</div>
    </section>
  );
}
