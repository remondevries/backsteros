import { useEffect, useState } from "react";
import {
  CalendarIcon,
  ContactPersonIcon,
  DocumentIcon,
  SettingsContentHeader,
} from "@backsteros/ui";

import {
  SYNC_CONFLICT_PROTOTYPE_MOCKS,
  type SyncConflictEntityKind,
  type SyncConflictFieldId,
  type SyncConflictPrototype,
} from "../lib/sync-conflict-prototype-mock";

type FieldSource = "local" | "cloud";

type ConflictSelections = Record<SyncConflictFieldId, FieldSource>;

const ENTITY_ICON_SIZE = 13;
const RESOLVE_MS = 5_000;

function SyncConflictResolveIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M3.5 8c1.392-3.179 4.823-5 8.522-5 4.679 0 8.525 3.552 8.978 8.1" />
      <path d="M7.511 8.4h-3.97a.54.54 0 0 1-.54-.54V3.9M20.5 16c-1.392 3.179-4.823 5-8.522 5C7.299 21 3.453 17.448 3 12.9" />
      <path d="M16.489 15.6h3.97a.54.54 0 0 1 .541.54v3.96" />
    </svg>
  );
}

function SyncConflictLocalIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M3.25 13h17.5M5.45 4.11l-2.162 7.847A8 8 0 0 0 3 14.082V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.918a8 8 0 0 0-.288-2.125L18.55 4.11A2 2 0 0 0 16.76 3H7.24a2 2 0 0 0-1.79 1.11M17 17h1m-5 0h1" />
    </svg>
  );
}

function SyncConflictCloudIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="m11.966 20-.004-8m7.863 5c4.495-3.16.475-7.73-3.706-7.73C13.296-1.732-3.265 7.368 4.074 15.662" />
      <path d="m15.144 14.318-3.182-3.182-3.182 3.182" />
    </svg>
  );
}

function SyncConflictEntityIcon({
  kind,
}: {
  kind: SyncConflictEntityKind;
}) {
  switch (kind) {
    case "Meeting":
      return <CalendarIcon size={ENTITY_ICON_SIZE} />;
    case "Document":
      return <DocumentIcon size={ENTITY_ICON_SIZE} />;
    case "Contact":
    case "CRM activity":
      return <ContactPersonIcon size={ENTITY_ICON_SIZE} />;
  }
}

function SyncConflictFileLabel({
  conflict,
}: {
  conflict: SyncConflictPrototype;
}) {
  return (
    <span className="settings-sync-conflict__side-file">
      <span className="settings-sync-conflict__side-file-icon" aria-hidden="true">
        <SyncConflictEntityIcon kind={conflict.entityKind} />
      </span>
      <span className="settings-sync-conflict__side-file-text">
        {conflict.entityKind} {conflict.displayId}
      </span>
    </span>
  );
}

/**
 * Static Settings → Syncing conflict resolution prototype.
 * Local UI state only — no replication or API calls.
 */
export function SettingsSyncingConflictPrototype({
  conflicts = SYNC_CONFLICT_PROTOTYPE_MOCKS,
  title = "Syncing",
  description = "Cloud and local sync status, conflicts, and replication",
  /** When true, skip the page header (workbench supplies it). */
  embedded = false,
  /** Fires once every conflict in the queue has been merged. */
  onAllResolved,
}: {
  conflicts?: SyncConflictPrototype[];
  title?: string;
  description?: string;
  embedded?: boolean;
  onAllResolved?: () => void;
}) {
  const total = conflicts.length;
  const [index, setIndex] = useState(0);
  const [selectionsByConflict, setSelectionsByConflict] = useState<
    Record<string, ConflictSelections>
  >(() => Object.fromEntries(
    conflicts.map((conflict) => [conflict.entityId, defaultSelections(conflict)]),
  ));
  const [appliedIds, setAppliedIds] = useState<Record<string, true>>({});
  const [resolving, setResolving] = useState(false);
  const [remainingIds, setRemainingIds] = useState(() =>
    conflicts.map((conflict) => conflict.entityId),
  );

  const visibleConflicts = conflicts.filter((conflict) =>
    remainingIds.includes(conflict.entityId),
  );
  const visibleTotal = visibleConflicts.length;
  const safeIndex = Math.min(index, Math.max(visibleTotal - 1, 0));
  const conflict = visibleConflicts[safeIndex];
  const selections = conflict
    ? (selectionsByConflict[conflict.entityId] ?? defaultSelections(conflict))
    : ({} as ConflictSelections);
  const applied = conflict
    ? Boolean(appliedIds[conflict.entityId])
    : false;

  useEffect(() => {
    if (!resolving || !conflict) return;
    const resolvedId = conflict.entityId;
    const timer = window.setTimeout(() => {
      setAppliedIds((current) => ({
        ...current,
        [resolvedId]: true,
      }));
      setResolving(false);
      setRemainingIds((current) => {
        const next = current.filter((id) => id !== resolvedId);
        if (next.length === 0) {
          queueMicrotask(() => onAllResolved?.());
        } else {
          setIndex((i) => Math.min(i, next.length - 1));
        }
        return next;
      });
    }, RESOLVE_MS);
    return () => window.clearTimeout(timer);
  }, [resolving, conflict, onAllResolved]);

  const selectSource = (fieldId: SyncConflictFieldId, source: FieldSource) => {
    if (resolving) return;
    setAppliedIds((current) => {
      if (!current[conflict.entityId]) return current;
      const next = { ...current };
      delete next[conflict.entityId];
      return next;
    });
    setSelectionsByConflict((current) => ({
      ...current,
      [conflict.entityId]: {
        ...(current[conflict.entityId] ?? defaultSelections(conflict)),
        [fieldId]: source,
      },
    }));
  };

  const goTo = (nextIndex: number) => {
    if (resolving) return;
    if (nextIndex < 0 || nextIndex >= visibleTotal) return;
    setIndex(nextIndex);
  };

  const startMerge = () => {
    if (resolving || !conflict) return;
    setResolving(true);
  };

  const pager = (
    <div
      className="settings-sync-conflict__pager"
      role="navigation"
      aria-label="Conflict pages"
    >
      <button
        type="button"
        className="settings-sync-conflict__pager-btn"
        aria-label="Previous conflict"
        disabled={resolving || safeIndex <= 0 || visibleTotal === 0}
        onClick={() => goTo(safeIndex - 1)}
      >
        ‹
      </button>
      <span className="settings-sync-conflict__pager-label" aria-live="polite">
        {visibleTotal === 0 ? "0 / 0" : `${safeIndex + 1} / ${visibleTotal}`}
      </span>
      <button
        type="button"
        className="settings-sync-conflict__pager-btn"
        aria-label="Next conflict"
        disabled={
          resolving || safeIndex >= visibleTotal - 1 || visibleTotal === 0
        }
        onClick={() => goTo(safeIndex + 1)}
      >
        ›
      </button>
    </div>
  );

  if (!conflict) {
    return (
      <div className="settings-sync-conflict">
        <p className="settings-hint">All field conflicts in this queue are merged.</p>
      </div>
    );
  }

  return (
    <div className="settings-sync-conflict">
      {embedded ? (
        <div className="settings-sync-conflict__embedded-toolbar">
          <span className="settings-sync-conflict__badge">Syncing conflict</span>
          {pager}
        </div>
      ) : (
        <SettingsContentHeader
          title={title}
          description={description}
          titleBadge={
            <span className="settings-sync-conflict__badge">
              Syncing conflict
            </span>
          }
          trailing={pager}
        />
      )}

      <section
        className={[
          "settings-sync-conflict__stage",
          resolving ? "is-resolving" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Sync conflict resolution prototype"
        aria-busy={resolving}
      >
      {resolving ? (
        <div
          className="settings-sync-conflict__resolve-modal"
          role="status"
          aria-live="polite"
        >
          <div className="settings-sync-conflict__resolve-card">
            <span
              className="settings-sync-conflict__resolve-icon"
              aria-hidden="true"
            >
              <SyncConflictResolveIcon size={24} />
            </span>
            <p className="settings-sync-conflict__resolve-title">
              Syncing the solution
            </p>
            <p className="settings-sync-conflict__resolve-copy">
              Applying your merge for {conflict.entityKind}{" "}
              {conflict.displayId}…
            </p>
          </div>
        </div>
      ) : null}
      <div
        className="settings-sync-conflict__compare"
        role="table"
        inert={resolving ? true : undefined}
      >
        <div className="settings-sync-conflict__compare-head" role="row">
          <div
            className="settings-sync-conflict__col settings-sync-conflict__col--label"
            role="columnheader"
          >
            Field
          </div>
          <div
            className="settings-sync-conflict__col settings-sync-conflict__col--side"
            role="columnheader"
          >
            <div className="settings-sync-conflict__side-head">
              <div className="settings-sync-conflict__side-meta">
                <SyncConflictFileLabel conflict={conflict} />
                <span className="settings-sync-conflict__side-sub">
                  {conflict.localUpdatedAtLabel}
                </span>
              </div>
              <span
                className="settings-sync-conflict__side-badge settings-sync-conflict__side-badge--icon"
                title="Local"
                aria-label="Local"
              >
                <SyncConflictLocalIcon size={14} />
              </span>
            </div>
          </div>
          <div
            className="settings-sync-conflict__col settings-sync-conflict__col--side"
            role="columnheader"
          >
            <div className="settings-sync-conflict__side-head">
              <div className="settings-sync-conflict__side-meta">
                <SyncConflictFileLabel conflict={conflict} />
                <span className="settings-sync-conflict__side-sub">
                  {conflict.cloudUpdatedAtLabel}
                </span>
              </div>
              <span
                className="settings-sync-conflict__side-badge settings-sync-conflict__side-badge--icon"
                title="Cloud"
                aria-label="Cloud"
              >
                <SyncConflictCloudIcon size={14} />
              </span>
            </div>
          </div>
        </div>

        {conflict.fields.map((field) => {
          const selected = selections[field.id] ?? "local";
          const pickable = field.differs;
          return (
            <div
              key={field.id}
              className={[
                "settings-sync-conflict__row",
                pickable ? "is-diff" : "is-same",
              ].join(" ")}
              role="row"
            >
              <div
                className="settings-sync-conflict__col settings-sync-conflict__col--label"
                role="rowheader"
              >
                {field.label}
              </div>
              {pickable ? (
                <>
                  <button
                    type="button"
                    className={[
                      "settings-sync-conflict__col",
                      "settings-sync-conflict__col--side",
                      "settings-sync-conflict__cell",
                      "is-diff-value",
                      selected === "local" ? "is-chosen" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-pressed={selected === "local"}
                    aria-label={`Keep local ${field.label}: ${field.localValue}`}
                    onClick={() => selectSource(field.id, "local")}
                  >
                    {field.localValue}
                  </button>
                  <button
                    type="button"
                    className={[
                      "settings-sync-conflict__col",
                      "settings-sync-conflict__col--side",
                      "settings-sync-conflict__cell",
                      "is-diff-value",
                      selected === "cloud" ? "is-chosen" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-pressed={selected === "cloud"}
                    aria-label={`Keep cloud ${field.label}: ${field.cloudValue}`}
                    onClick={() => selectSource(field.id, "cloud")}
                  >
                    {field.cloudValue}
                  </button>
                </>
              ) : (
                <>
                  <div
                    className="settings-sync-conflict__col settings-sync-conflict__col--side settings-sync-conflict__cell is-same-value"
                    role="cell"
                  >
                    {field.localValue}
                  </div>
                  <div
                    className="settings-sync-conflict__col settings-sync-conflict__col--side settings-sync-conflict__cell is-same-value is-discarded"
                    role="cell"
                  >
                    {field.cloudValue}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div
        className="settings-sync-conflict__actions"
        inert={resolving ? true : undefined}
      >
        {applied ? (
          <p
            className="settings-hint settings-sync-conflict__applied"
            role="status"
          >
            Selections confirmed for {conflict.displayId} (prototype — not
            written).
            {index < total - 1 ? " Use › to resolve the next conflict." : null}
          </p>
        ) : (
          <p className="settings-hint">
            Prototype — Merge file only confirms selections for this conflict in
            the UI.
          </p>
        )}
        <button
          type="button"
          className="settings-sync-conflict__apply"
          disabled={resolving}
          onClick={startMerge}
        >
          Merge file
        </button>
      </div>
      </section>
    </div>
  );
}

function defaultSelections(
  conflict: SyncConflictPrototype,
): ConflictSelections {
  const sources = {} as ConflictSelections;
  for (const field of conflict.fields) {
    sources[field.id] = "local";
  }
  return sources;
}
