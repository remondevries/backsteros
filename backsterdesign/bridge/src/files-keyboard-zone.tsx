import { useEffect, useMemo, useRef } from "react";
import {
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
} from "@backsteros/ui";

export type DesignFileNavItem = {
  id: string;
  name: string;
};

const FILE_ATTR = "data-bd-file-id";
const HIGHLIGHT_CLASS = "bd-file-keyboard-highlight";
/** Lets the Penpot shell know the files content zone owns j/k. */
const FILE_NAV_ATTR = "data-bd-file-nav";

function syncFileHighlight(fileId: string | null): void {
  if (typeof document === "undefined") return;
  for (const el of document.querySelectorAll(`.${HIGHLIGHT_CLASS}`)) {
    el.classList.remove(HIGHLIGHT_CLASS);
  }
  if (!fileId) return;
  const target = document.querySelector<HTMLElement>(
    `[${FILE_ATTR}="${CSS.escape(fileId)}"]`,
  );
  if (!target) return;
  target.classList.add(HIGHLIGHT_CLASS);
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function stepFileId(
  itemIds: readonly string[],
  currentId: string | null,
  direction: "up" | "down",
): string | null {
  if (itemIds.length === 0) return null;
  const idx =
    currentId == null ? -1 : itemIds.findIndex((id) => id === currentId);
  if (direction === "down") {
    if (idx < 0) return itemIds[0] ?? null;
    return itemIds[Math.min(itemIds.length - 1, idx + 1)] ?? null;
  }
  if (idx < 0) return itemIds[itemIds.length - 1] ?? null;
  return itemIds[Math.max(0, idx - 1)] ?? null;
}

/**
 * Registers Penpot project files as the list-nav `content` zone so Tab moves
 * j/k between the tasks rail (main) and the files grid — same split as
 * BacksterOS project workbench.
 *
 * Stepping uses `resolveNextItemId` (string-stable) instead of the default
 * list path, which can land on first/last when highlight ids drift.
 */
export function FilesKeyboardZone({
  files,
  onOpenFile,
}: {
  files: DesignFileNavItem[];
  onOpenFile?: (fileId: string) => void;
}) {
  const idsKey = files.map((f) => f.id).join("\0");
  const itemIds = useMemo(
    () => files.map((f) => f.id).filter(Boolean),
    // idsKey captures content; `files` alone is a new array every mount().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const containerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_CONTENT,
  );
  const onOpenRef = useRef(onOpenFile);
  onOpenRef.current = onOpenFile;
  const { activeZone } = useListKeyboardNavigationZone();

  const { highlightedId } = useListKeyboardNavigation({
    zone: LIST_KEYBOARD_NAV_ZONE_CONTENT,
    itemIds,
    selectedId: null,
    containerRef,
    enabled: itemIds.length > 0,
    onNavigate: (fileId) => {
      onOpenRef.current?.(fileId);
    },
    resolveNextItemId: ({ key, currentId, itemIds: ids }) => {
      const normalized = key.length === 1 ? key.toLowerCase() : key;
      if (normalized === "j" || key === "ArrowDown") {
        return stepFileId(ids, currentId, "down");
      }
      if (normalized === "k" || key === "ArrowUp") {
        return stepFileId(ids, currentId, "up");
      }
      return null;
    },
  });

  useEffect(() => {
    const root = document.documentElement;
    if (activeZone === LIST_KEYBOARD_NAV_ZONE_CONTENT) {
      root.setAttribute(FILE_NAV_ATTR, "1");
    } else {
      root.removeAttribute(FILE_NAV_ATTR);
    }
    return () => root.removeAttribute(FILE_NAV_ATTR);
  }, [activeZone]);

  useEffect(() => {
    syncFileHighlight(highlightedId);
    return () => syncFileHighlight(null);
  }, [highlightedId]);

  if (itemIds.length === 0) return null;

  return (
    <div
      {...containerProps}
      ref={containerRef}
      className="backsteros-files-keyboard-zone"
      aria-hidden="true"
    >
      {files.map((file) => (
        <div
          key={file.id}
          data-keyboard-nav-item={file.id}
          data-file-name={file.name}
        />
      ))}
    </div>
  );
}
