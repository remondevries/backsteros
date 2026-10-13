import { cn } from "~/lib/utils";

import "./pillNav.css";

export type BacksterosPillNavItem<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly count?: number | string | null;
};

/**
 * Sliding-free pill tab strip — mirrors BacksterOS desktop `PillNav`
 * used on the codebase project workbench.
 */
export function BacksterosPillNav<T extends string>(props: {
  readonly items: readonly BacksterosPillNavItem<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly ariaLabel: string;
  readonly className?: string | undefined;
}) {
  const { items, value, onChange, ariaLabel, className } = props;

  return (
    <nav className={cn("bos-pill-nav", className)} aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.value === value;
        const count = item.count === null || item.count === undefined ? null : String(item.count);
        return (
          <button
            key={item.value}
            type="button"
            data-pill-nav-value={item.value}
            className={cn("bos-pill-nav-item", active && "is-active")}
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(item.value)}
          >
            <span className="bos-pill-nav-item-label">{item.label}</span>
            {count != null ? <span className="bos-pill-nav-item-count">{count}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
