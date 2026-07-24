"use client";

export type PillNavItem<T extends string> = {
  value: T;
  label: string;
  /** Optional count shown in a small circle beside the label. */
  count?: number | string | null;
};

export type PillNavProps<T extends string> = {
  items: readonly PillNavItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
};

export function PillNav<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: PillNavProps<T>) {
  return (
    <nav className="app-pill-nav" aria-label={ariaLabel}>
      {items.map((item) => {
        const isActive = item.value === value;
        const count =
          item.count === null || item.count === undefined
            ? null
            : String(item.count);
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`app-pill-nav-item${isActive ? " is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="app-pill-nav-item-label">{item.label}</span>
            {count != null ? (
              <span className="app-pill-nav-item-count">{count}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
