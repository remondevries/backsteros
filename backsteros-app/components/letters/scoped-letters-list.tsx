"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useRef } from "react";

import { LetterDisplayIdLabel } from "@/components/letters/letter-display-id-label";
import { LetterDueDateDropdown } from "@/components/letters/letter-due-date-dropdown";
import { LetterStatusDropdown } from "@/components/letters/letter-status-dropdown";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { TaskStatusIcon } from "@/components/task-status";
import { TaskStatusGroupSection } from "@/components/tasks/task-status-group-section";
import type { Letter } from "@/lib/db/schema";
import { letterMatchesRouteSlug } from "@/lib/entity-route-hrefs";
import { groupLettersByStatus } from "@/lib/letters/group-letters-by-status";
import { getSelectedLetterSlugFromPathname } from "@/lib/letters/navigation-path";
import { keyboardNavListItemClass } from "@/lib/shortcuts/keyboard-nav-item";
import { flattenGroupedListItemIds } from "@/lib/shortcuts/list-keyboard-nav-index";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "@/lib/shortcuts/list-keyboard-nav-zone";
import { migrateLegacyTaskStatus, type TaskStatus } from "@/lib/task-status";

type ScopedLettersListProps = {
  letters: Letter[];
  resolveHref: (letter: Letter) => string;
  resolveComposeHref: (status: TaskStatus) => string;
  allowCompose?: boolean;
};

export function ScopedLettersList({
  letters,
  resolveHref,
  resolveComposeHref,
  allowCompose = true,
}: ScopedLettersListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const [localLetters, setLocalLetters] = useState(letters);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskStatus>>(
    () => new Set(),
  );

  const [prevLetters, setPrevLetters] = useState(letters);
  if (letters !== prevLetters) {
    setPrevLetters(letters);
    setLocalLetters(letters);
  }

  const groups = useMemo(
    () => groupLettersByStatus(localLetters),
    [localLetters],
  );

  const selectedLetterSlug = getSelectedLetterSlugFromPathname(pathname);
  const selectedLetterId =
    localLetters.find((letter) =>
      letterMatchesRouteSlug(letter, selectedLetterSlug),
    )?.id ?? null;

  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groups.map((group) => ({ key: group.status, items: group.letters })),
        collapsedGroups,
        (letter) => letter.id,
      ),
    [collapsedGroups, groups],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedLetterId,
    onNavigate: (letterId) => {
      const letter = localLetters.find((entry) => entry.id === letterId);
      if (letter) {
        router.push(resolveHref(letter));
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  function toggleGroup(status: TaskStatus) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  function expandGroup(status: TaskStatus) {
    setCollapsedGroups((current) => {
      if (!current.has(status)) return current;
      const next = new Set(current);
      next.delete(status);
      return next;
    });
  }

  function handleLetterStatusChange(letterId: string, status: TaskStatus) {
    setLocalLetters((current) =>
      current.map((letter) =>
        letter.id === letterId ? { ...letter, status } : letter,
      ),
    );
    expandGroup(status);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul
        ref={listRef}
        className="m-0 flex list-none flex-col gap-1 p-0"
        role="list"
        {...listContainerProps}
      >
        {groups.map((group) => {
          const collapsed = collapsedGroups.has(group.status);

          return (
            <TaskStatusGroupSection
              key={group.status}
              groupKey={group.status}
              title={group.label}
              icon={
                <TaskStatusIcon
                  status={group.status}
                  size={14}
                  title={group.label}
                />
              }
              collapsed={collapsed}
              onToggle={() => toggleGroup(group.status)}
              onExpandGroup={() => expandGroup(group.status)}
              onAddTask={
                allowCompose
                  ? () => {
                      expandGroup(group.status);
                      router.push(resolveComposeHref(group.status));
                    }
                  : undefined
              }
              addActionLabel="letter"
            >
              {group.letters.map((letter) => {
                const rowClassName = `group flex items-center gap-3 rounded-[8px] px-2 py-2 hover:bg-white/[0.03] ${keyboardNavListItemClass(highlightedId === letter.id)}`;

                return (
                  <li key={letter.id}>
                    <Link
                      href={resolveHref(letter)}
                      className={rowClassName}
                      aria-current={
                        selectedLetterId === letter.id ? "page" : undefined
                      }
                    >
                      <span
                        className="shrink-0"
                        onClick={(event) => event.preventDefault()}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <LetterStatusDropdown
                          letterId={letter.id}
                          projectId={letter.projectId}
                          status={migrateLegacyTaskStatus(letter.status)}
                          title={letter.title}
                          letterNumber={letter.number}
                          variant="icon"
                          onStatusChange={(status) =>
                            handleLetterStatusChange(letter.id, status)
                          }
                        />
                      </span>
                      <LetterDisplayIdLabel letter={letter} />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground/85 group-hover:text-foreground">
                        {letter.title}
                      </span>
                      <span
                        className="shrink-0"
                        onClick={(event) => event.preventDefault()}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <LetterDueDateDropdown
                          letterId={letter.id}
                          projectId={letter.projectId}
                          dueDate={letter.dueDate}
                          status={letter.status}
                          variant="list"
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </TaskStatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}
