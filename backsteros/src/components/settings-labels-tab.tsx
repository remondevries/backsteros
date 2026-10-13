import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  CRM_GROUP_COLOR_PRESETS,
  nextCrmGroupPresetColor,
  resolveCrmGroupColor,
} from "@backsteros/ui";

import { usePowerSyncQuery } from "../lib/powersync-context";
import { parseStringIdArray } from "../lib/workspace/row-mappers";
import { useTaskLabels, type TaskLabel } from "../lib/use-task-labels";

const TASK_LABEL_IDS_SQL = `SELECT label_ids FROM tasks WHERE deleted_at IS NULL`;

const LABEL_COLOR_PRESETS = [
  ...CRM_GROUP_COLOR_PRESETS,
  "#6366F1",
  "#F9A8D4",
] as const;

type Box = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type OpenPopover =
  | { kind: "menu"; id: string; box: Box }
  | { kind: "color"; id: string; box: Box }
  | { kind: "draft-color"; box: Box };

function boxOf(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function formatLastUsed(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const delta = Date.now() - then;
  if (delta < 0) return "—";
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < hour) {
    const count = Math.max(1, Math.round(delta / minute));
    return count === 1 ? "1 min ago" : `${count} mins ago`;
  }
  if (delta < day) {
    const count = Math.round(delta / hour);
    return count === 1 ? "1 hour ago" : `${count} hours ago`;
  }
  if (delta < 30 * day) {
    const count = Math.max(1, Math.round(delta / day));
    return count === 1 ? "1 day ago" : `${count} days ago`;
  }
  if (delta < 365 * day) {
    const count = Math.max(1, Math.round(delta / (30 * day)));
    return count === 1 ? "1 month ago" : `${count} months ago`;
  }
  const count = Math.max(1, Math.round(delta / (365 * day)));
  return count === 1 ? "1 year ago" : `${count} years ago`;
}

function formatCreated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function latestIso(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isNaN(time) || time <= bestTime) continue;
    bestTime = time;
    best = value;
  }
  return best;
}

function checkInk(hex: string): string {
  const parsed = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(parsed)) return "#111111";
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 160 ? "#111111" : "#ffffff";
}

function matchesQuery(label: TaskLabel, query: string): boolean {
  if (!query) return true;
  return (
    label.name.toLowerCase().includes(query) ||
    (label.description ?? "").toLowerCase().includes(query)
  );
}

function Floating({
  box,
  align,
  className,
  children,
}: {
  box: Box;
  align: "start" | "end";
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: box.bottom + 6,
    left: align === "start" ? box.left : box.right,
    zIndex: 40,
  });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    let top = box.bottom + 6;
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, box.top - 6 - rect.height);
    }
    let left = align === "start" ? box.left : box.right - rect.width;
    if (left + rect.width > window.innerWidth - 8) {
      left = window.innerWidth - 8 - rect.width;
    }
    if (left < 8) left = 8;
    setStyle({ position: "fixed", top, left, zIndex: 40 });
  }, [align, box]);

  return (
    <div ref={ref} className={className} style={style} data-label-popover="">
      {children}
    </div>
  );
}

function LabelColorPopover({
  box,
  value,
  disabled,
  onChange,
}: {
  box: Box;
  value: string;
  disabled: boolean;
  onChange: (color: string) => void;
}) {
  const selected = resolveCrmGroupColor(value).toLowerCase();
  return (
    <Floating box={box} align="start" className="task-label-color-popover">
      {LABEL_COLOR_PRESETS.map((color) => {
        const active = selected === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            className="task-label-color-popover__swatch"
            style={{ backgroundColor: color, color: checkInk(color) }}
            aria-label={`Color ${color}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(color)}
          >
            {active ? <CheckIcon /> : null}
          </button>
        );
      })}
      <span className="task-label-color-popover__divider" aria-hidden="true" />
      <input
        type="color"
        className="task-label-color-popover__wheel"
        aria-label="Custom color"
        disabled={disabled}
        value={resolveCrmGroupColor(value).toLowerCase()}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
      />
    </Floating>
  );
}

export function SettingsLabelsTab() {
  const { labels, error, busy, loading, createLabel, updateLabel, deleteLabel } =
    useTaskLabels();
  const usage = usePowerSyncQuery<{ label_ids: string | null }>(TASK_LABEL_IDS_SQL);
  const [query, setQuery] = useState("");
  const [composer, setComposer] = useState<null | "label" | "group">(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftColor, setDraftColor] = useState(() => nextCrmGroupPresetColor(0));
  const [draftParent, setDraftParent] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [descriptionId, setDescriptionId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [open, setOpen] = useState<OpenPopover | null>(null);
  const cancelEdit = useRef(false);

  const counts = useMemo(() => {
    const next = new Map<string, number>();
    for (const row of usage.data ?? []) {
      for (const id of parseStringIdArray(row.label_ids)) {
        next.set(id, (next.get(id) ?? 0) + 1);
      }
    }
    return next;
  }, [usage.data]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-label-popover]")) return;
      setOpen(null);
    }
    function close() {
      setOpen(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const groups = useMemo(
    () => labels.filter((label) => label.isGroup).sort(byName),
    [labels],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const childrenOf = new Map<string, TaskLabel[]>();
    const top: TaskLabel[] = [];
    const groupIds = new Set(labels.filter((label) => label.isGroup).map((label) => label.id));
    for (const label of labels) {
      if (label.parentId && groupIds.has(label.parentId) && !label.isGroup) {
        const list = childrenOf.get(label.parentId) ?? [];
        list.push(label);
        childrenOf.set(label.parentId, list);
      } else if (!label.parentId || label.isGroup || !groupIds.has(label.parentId)) {
        top.push(label);
      }
    }
    top.sort(byName);
    for (const list of childrenOf.values()) list.sort(byName);

    const visible: Array<{
      label: TaskLabel;
      depth: 0 | 1;
      taskCount: number;
      lastUsedAt: string | null;
    }> = [];

    for (const label of top) {
      if (!label.isGroup) {
        if (!matchesQuery(label, needle)) continue;
        visible.push({
          label,
          depth: 0,
          taskCount: counts.get(label.id) ?? 0,
          lastUsedAt: label.lastUsedAt,
        });
        continue;
      }
      const children = childrenOf.get(label.id) ?? [];
      const groupMatches = matchesQuery(label, needle);
      const matchingChildren = children.filter((child) => matchesQuery(child, needle));
      if (needle && !groupMatches && matchingChildren.length === 0) continue;
      const taskCount =
        (counts.get(label.id) ?? 0) +
        children.reduce((sum, child) => sum + (counts.get(child.id) ?? 0), 0);
      visible.push({
        label,
        depth: 0,
        taskCount,
        lastUsedAt: latestIso([
          label.lastUsedAt,
          ...children.map((child) => child.lastUsedAt),
        ]),
      });
      if (collapsed.has(label.id) && !needle) continue;
      const shown = needle && !groupMatches ? matchingChildren : children;
      for (const child of shown) {
        visible.push({
          label: child,
          depth: 1,
          taskCount: counts.get(child.id) ?? 0,
          lastUsedAt: child.lastUsedAt,
        });
      }
    }
    return visible;
  }, [collapsed, counts, labels, query]);

  function openComposer(kind: "label" | "group", parentId = "") {
    setComposer(kind);
    setDraftName("");
    setDraftDescription("");
    setDraftParent(parentId);
    setDraftColor(
      nextCrmGroupPresetColor(labels.filter((label) => !label.isGroup).length),
    );
    setOpen(null);
  }

  function commitRename(label: TaskLabel) {
    if (cancelEdit.current) {
      cancelEdit.current = false;
      return;
    }
    const next = renameDraft.trim().replace(/\s+/g, " ");
    setRenamingId(null);
    if (!next || next === label.name) return;
    void updateLabel(label.id, { name: next }).catch(() => undefined);
  }

  function commitDescription(label: TaskLabel) {
    if (cancelEdit.current) {
      cancelEdit.current = false;
      return;
    }
    const next = descriptionDraft.trim().replace(/\s+/g, " ");
    setDescriptionId(null);
    if (next === (label.description ?? "")) return;
    void updateLabel(label.id, { description: next || null }).catch(() => undefined);
  }

  return (
    <div className="task-label-settings">
      <div className="task-label-settings__toolbar">
        <label className="task-label-settings__filter">
          <SearchIcon />
          <input
            type="search"
            value={query}
            placeholder="Filter by name..."
            aria-label="Filter by name"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="task-label-settings__actions">
          <button
            type="button"
            className="task-label-settings__button"
            disabled={busy}
            onClick={() => openComposer("group")}
          >
            New group
          </button>
          <button
            type="button"
            className="task-label-settings__button task-label-settings__button--primary"
            disabled={busy}
            onClick={() => openComposer("label")}
          >
            New label
          </button>
        </div>
      </div>

      {composer ? (
        <form
          className="task-label-settings__composer"
          onSubmit={(event) => {
            event.preventDefault();
            const name = draftName;
            const description = draftDescription;
            const color = draftColor;
            const parentId = draftParent;
            const kind = composer;
            void createLabel({
              name,
              description: description.trim() ? description : null,
              ...(kind === "group"
                ? { isGroup: true }
                : { color, parentId: parentId || null }),
            })
              .then(() => {
                setComposer(null);
                setDraftName("");
                setDraftDescription("");
              })
              .catch(() => undefined);
          }}
        >
          <div className="task-label-settings__composer-name">
            {composer === "label" ? (
              <span className="task-label-table__color" data-label-popover="">
                <button
                  type="button"
                  className="task-label-table__dot"
                  style={{ backgroundColor: resolveCrmGroupColor(draftColor) }}
                  aria-label="New label color"
                  onClick={(event) => {
                    const box = boxOf(event.currentTarget);
                    setOpen((current) =>
                      current?.kind === "draft-color" ? null : { kind: "draft-color", box },
                    );
                  }}
                />
              </span>
            ) : (
              <span className="task-label-table__group-icon" aria-hidden="true">
                <GroupIcon />
              </span>
            )}
            <input
              autoFocus
              value={draftName}
              disabled={busy}
              placeholder={composer === "group" ? "Group name" : "Label name"}
              aria-label={composer === "group" ? "Group name" : "Label name"}
              onChange={(event) => setDraftName(event.target.value)}
            />
          </div>
          <input
            value={draftDescription}
            disabled={busy}
            placeholder="Description"
            aria-label="Description"
            onChange={(event) => setDraftDescription(event.target.value)}
          />
          {composer === "label" && groups.length > 0 ? (
            <select
              value={draftParent}
              disabled={busy}
              aria-label="Group"
              onChange={(event) => setDraftParent(event.target.value)}
            >
              <option value="">No group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="submit"
            className="task-label-settings__button task-label-settings__button--primary"
            disabled={busy || !draftName.trim()}
          >
            {composer === "group" ? "Add group" : "Add label"}
          </button>
          <button
            type="button"
            className="task-label-settings__button"
            disabled={busy}
            onClick={() => setComposer(null)}
          >
            Cancel
          </button>
        </form>
      ) : null}

      {open?.kind === "draft-color" ? (
        <LabelColorPopover
          box={open.box}
          value={draftColor}
          disabled={busy}
          onChange={setDraftColor}
        />
      ) : null}

      {error ? <p className="task-label-settings__error">{error}</p> : null}
      {loading ? <p className="task-label-settings__hint">Loading labels…</p> : null}

      <table className="task-label-table">
        <thead>
          <tr>
            <th scope="col">
              Name <span aria-hidden="true">↓</span>
            </th>
            <th scope="col">Description</th>
            <th scope="col" className="task-label-table__count">
              Tasks
            </th>
            <th scope="col">Last used</th>
            <th scope="col">Created</th>
            <th scope="col" className="task-label-table__menu-col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {!loading && rows.length === 0 ? (
            <tr>
              <td className="task-label-table__empty" colSpan={6}>
                {labels.length === 0
                  ? "No labels yet."
                  : "No labels match that filter."}
              </td>
            </tr>
          ) : null}
          {rows.map((row) => {
            const { label } = row;
            const renaming = renamingId === label.id;
            const editingDescription = descriptionId === label.id;
            return (
              <tr key={label.id} className={label.isGroup ? "is-group" : undefined}>
                <td>
                  <div
                    className="task-label-table__name"
                    style={{ paddingLeft: row.depth * 22 }}
                  >
                    {label.isGroup ? (
                      <button
                        type="button"
                        className="task-label-table__chevron"
                        aria-expanded={!collapsed.has(label.id)}
                        aria-label={
                          collapsed.has(label.id)
                            ? `Expand ${label.name}`
                            : `Collapse ${label.name}`
                        }
                        onClick={() => {
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(label.id)) next.delete(label.id);
                            else next.add(label.id);
                            return next;
                          });
                        }}
                      >
                        <ChevronIcon open={!collapsed.has(label.id)} />
                      </button>
                    ) : (
                      <span className="task-label-table__chevron-spacer" />
                    )}
                    {label.isGroup ? (
                      <span className="task-label-table__group-icon" aria-hidden="true">
                        <GroupIcon />
                      </span>
                    ) : (
                      <span className="task-label-table__color" data-label-popover="">
                        <button
                          type="button"
                          className="task-label-table__dot"
                          style={{
                            backgroundColor: resolveCrmGroupColor(label.color),
                          }}
                          aria-label={`${label.name} color`}
                          disabled={busy}
                          onClick={(event) => {
                            const box = boxOf(event.currentTarget);
                            setOpen((current) =>
                              current?.kind === "color" && current.id === label.id
                                ? null
                                : { kind: "color", id: label.id, box },
                            );
                          }}
                        />
                      </span>
                    )}
                    {renaming ? (
                      <input
                        className="task-label-table__edit"
                        autoFocus
                        value={renameDraft}
                        disabled={busy}
                        aria-label={`Rename ${label.name}`}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={() => commitRename(label)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                          if (event.key === "Escape") {
                            cancelEdit.current = true;
                            setRenamingId(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="task-label-table__name-text"
                        onClick={() => {
                          cancelEdit.current = false;
                          setDescriptionId(null);
                          setRenamingId(label.id);
                          setRenameDraft(label.name);
                          setOpen(null);
                        }}
                      >
                        {label.name}
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  {editingDescription ? (
                    <input
                      className="task-label-table__edit"
                      autoFocus
                      value={descriptionDraft}
                      disabled={busy}
                      aria-label={`${label.name} description`}
                      placeholder="Add description"
                      onChange={(event) => setDescriptionDraft(event.target.value)}
                      onBlur={() => commitDescription(label)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          cancelEdit.current = true;
                          setDescriptionId(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="task-label-table__description"
                      onClick={() => {
                        cancelEdit.current = false;
                        setRenamingId(null);
                        setDescriptionId(label.id);
                        setDescriptionDraft(label.description ?? "");
                        setOpen(null);
                      }}
                    >
                      {label.description ? (
                        label.description
                      ) : (
                        <span className="task-label-table__placeholder">
                          Add description
                        </span>
                      )}
                    </button>
                  )}
                </td>
                <td className="task-label-table__count">{row.taskCount}</td>
                <td className="task-label-table__meta">
                  {formatLastUsed(row.lastUsedAt)}
                </td>
                <td className="task-label-table__meta">{formatCreated(label.createdAt)}</td>
                <td className="task-label-table__menu-col">
                  <button
                    type="button"
                    className="task-label-table__more"
                    aria-label={`${label.name} actions`}
                    data-label-popover=""
                    onClick={(event) => {
                      const box = boxOf(event.currentTarget);
                      setOpen((current) =>
                        current?.kind === "menu" && current.id === label.id
                          ? null
                          : { kind: "menu", id: label.id, box },
                      );
                    }}
                  >
                    <EllipsisIcon />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {open?.kind === "color" ? (
        <LabelColorPopover
          box={open.box}
          value={
            labels.find((label) => label.id === open.id)?.color ??
            LABEL_COLOR_PRESETS[0]
          }
          disabled={busy}
          onChange={(color) => {
            void updateLabel(open.id, { color }).catch(() => undefined);
          }}
        />
      ) : null}

      {open?.kind === "menu"
        ? (() => {
            const label = labels.find((entry) => entry.id === open.id);
            if (!label) return null;
            const count = counts.get(label.id) ?? 0;
            return (
              <Floating box={open.box} align="end" className="task-label-table__menu">
                <button
                  type="button"
                  onClick={() => {
                    cancelEdit.current = false;
                    setDescriptionId(null);
                    setRenamingId(label.id);
                    setRenameDraft(label.name);
                    setOpen(null);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cancelEdit.current = false;
                    setRenamingId(null);
                    setDescriptionId(label.id);
                    setDescriptionDraft(label.description ?? "");
                    setOpen(null);
                  }}
                >
                  Edit description
                </button>
                {label.isGroup ? (
                  <button
                    type="button"
                    onClick={() => {
                      openComposer("label", label.id);
                    }}
                  >
                    Add label
                  </button>
                ) : null}
                {!label.isGroup && groups.length > 0 ? (
                  <>
                    <div className="task-label-table__menu-label">Move to group</div>
                    <button
                      type="button"
                      disabled={!label.parentId || busy}
                      onClick={() => {
                        setOpen(null);
                        void updateLabel(label.id, { parentId: null }).catch(
                          () => undefined,
                        );
                      }}
                    >
                      No group
                    </button>
                    {groups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        disabled={busy || label.parentId === group.id}
                        onClick={() => {
                          setOpen(null);
                          void updateLabel(label.id, { parentId: group.id }).catch(
                            () => undefined,
                          );
                        }}
                      >
                        {group.name}
                      </button>
                    ))}
                  </>
                ) : null}
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => {
                    setOpen(null);
                    const noun = count === 1 ? "1 task" : `${count} tasks`;
                    const message = label.isGroup
                      ? `Delete “${label.name}”? Labels in this group stay on their tasks and move out of the group.`
                      : count === 0
                        ? `Delete “${label.name}”?`
                        : `Delete “${label.name}”? It will be removed from ${noun}.`;
                    if (!window.confirm(message)) return;
                    void deleteLabel(label.id);
                  }}
                >
                  Delete
                </button>
              </Floating>
            );
          })()
        : null}
    </div>
  );
}

function byName(a: TaskLabel, b: TaskLabel): number {
  return a.name.localeCompare(b.name);
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.2 9.2 12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      {open ? (
        <path d="M2.5 4.25 6 7.75l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M4.25 2.5 7.75 6 4.25 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="7" cy="2.15" r="1.25" />
      <circle cx="11.85" cy="7" r="1.25" />
      <circle cx="7" cy="11.85" r="1.25" />
      <circle cx="2.15" cy="7" r="1.25" />
    </svg>
  );
}

function EllipsisIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="7" r="1.15" />
      <circle cx="7" cy="7" r="1.15" />
      <circle cx="11" cy="7" r="1.15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 5.1 4.1 7.2 8 2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
