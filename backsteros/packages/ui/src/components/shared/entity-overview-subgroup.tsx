"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { ChevronDownIcon } from "../icons/chevron-down-icon.js";

export type EntityOverviewSubgroupProps = {
  title: string;
  children?: ReactNode;
  /** When false, header is static (default true). */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** Persist open/closed in localStorage (defaults to the title). */
  storageKey?: string;
};

function storageKeyFor(key: string): string {
  return `backsteros:entity-overview-subgroup:${key}`;
}

function readStoredCollapsed(key: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKeyFor(key));
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // ignore quota / private mode
  }
  return null;
}

function writeStoredCollapsed(key: string, collapsed: boolean) {
  try {
    window.localStorage.setItem(storageKeyFor(key), collapsed ? "1" : "0");
  } catch {
    // ignore
  }
}

/**
 * Labeled rule separator + field group — same visual language as contact/org
 * Details subgroups ("Personal Details", "Contact Details", …).
 * Headers toggle collapse; preference is remembered when storage is available.
 */
export function EntityOverviewSubgroup({
  title,
  children,
  collapsible = true,
  defaultCollapsed = false,
  storageKey,
}: EntityOverviewSubgroupProps) {
  const panelId = useId();
  const persistKey = storageKey ?? title;
  const [collapsed, setCollapsed] = useState(
    collapsible ? defaultCollapsed : false,
  );

  useEffect(() => {
    if (!collapsible) return;
    const stored = readStoredCollapsed(persistKey);
    if (stored != null) setCollapsed(stored);
  }, [collapsible, persistKey]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      writeStoredCollapsed(persistKey, next);
      return next;
    });
  }

  const headerInner = (
    <>
      <span className="entity-overview-subgroup__label">{title}</span>
      <span className="entity-overview-subgroup__rule" aria-hidden="true" />
      {collapsible ? (
        <span className="entity-overview-subgroup__chevron" aria-hidden="true">
          <ChevronDownIcon size={12} />
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={[
        "entity-overview-subgroup",
        collapsible && collapsed ? "is-collapsed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-subgroup={title}
    >
      {collapsible ? (
        <button
          type="button"
          className="entity-overview-subgroup__header"
          aria-expanded={!collapsed}
          aria-controls={panelId}
          onClick={toggle}
        >
          {headerInner}
        </button>
      ) : (
        <div className="entity-overview-subgroup__header">{headerInner}</div>
      )}
      {children != null ? (
        <div
          id={panelId}
          className="entity-overview-subgroup__fields"
          hidden={collapsible && collapsed}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
