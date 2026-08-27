import { useRouter } from "expo-router";

import type { ListBoardView } from "../lib/list-board-view";
import {
  getTasksDueFilterLabel,
  TASKS_DUE_FILTERS,
  type TasksDueFilter,
} from "../lib/tasks-due-filters";
import { ListBoardToggle } from "./list-board-toggle";
import { PillNav } from "./pill-nav";
import { SectionListHeader } from "./section-list-header";

type Props = {
  dueFilter: TasksDueFilter;
  onDueFilterChange: (filter: TasksDueFilter) => void;
  boardView?: ListBoardView;
  onBoardViewToggle?: () => void;
};

export function TasksHeader({
  dueFilter,
  onDueFilterChange,
  boardView,
  onBoardViewToggle,
}: Props) {
  const router = useRouter();

  return (
    <SectionListHeader
      title="Tasks"
      showGlobalSearch
      onPressPlus={() =>
        router.push({
          pathname: "/(app)/tasks/new",
          params: { dueFilter },
        })
      }
      plusAccessibilityLabel="Create task"
      trailingControl={
        boardView && onBoardViewToggle ? (
          <ListBoardToggle view={boardView} onToggle={onBoardViewToggle} />
        ) : null
      }
      below={
        <PillNav
          accessibilityLabel="Due date filter"
          value={dueFilter}
          onChange={onDueFilterChange}
          items={TASKS_DUE_FILTERS.map((value) => ({
            value,
            label: getTasksDueFilterLabel(value),
          }))}
        />
      }
    />
  );
}
