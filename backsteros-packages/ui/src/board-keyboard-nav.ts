export type BoardKeyboardNavDirection = "up" | "down" | "left" | "right";

export function boardKeyboardNavDirection(
  key: string,
): BoardKeyboardNavDirection | null {
  if (key === "j" || key === "ArrowDown") {
    return "down";
  }
  if (key === "k" || key === "ArrowUp") {
    return "up";
  }
  if (key === "h" || key === "ArrowLeft") {
    return "left";
  }
  if (key === "l" || key === "ArrowRight") {
    return "right";
  }
  return null;
}

export function isBoardKeyboardNavigationKey(key: string): boolean {
  return boardKeyboardNavDirection(key) !== null;
}

export function findBoardPosition(
  grid: string[][],
  taskId: string,
): { columnIndex: number; rowIndex: number } | null {
  for (let columnIndex = 0; columnIndex < grid.length; columnIndex += 1) {
    const rowIndex = grid[columnIndex]!.indexOf(taskId);
    if (rowIndex >= 0) {
      return { columnIndex, rowIndex };
    }
  }
  return null;
}

export function findFirstBoardTaskId(grid: string[][]): string | null {
  for (const column of grid) {
    if (column.length > 0) {
      return column[0]!;
    }
  }
  return null;
}

export function findLastBoardTaskId(grid: string[][]): string | null {
  for (let columnIndex = grid.length - 1; columnIndex >= 0; columnIndex -= 1) {
    const column = grid[columnIndex]!;
    if (column.length > 0) {
      return column[column.length - 1]!;
    }
  }
  return null;
}

export function stepBoardTaskId(
  grid: string[][],
  currentId: string | null,
  direction: BoardKeyboardNavDirection,
): string | null {
  if (grid.every((column) => column.length === 0)) {
    return null;
  }

  const position =
    currentId != null ? findBoardPosition(grid, currentId) : null;

  if (!position) {
    if (direction === "up" || direction === "left") {
      return findLastBoardTaskId(grid);
    }
    return findFirstBoardTaskId(grid);
  }

  const { columnIndex, rowIndex } = position;

  if (direction === "down") {
    const column = grid[columnIndex]!;
    if (rowIndex < column.length - 1) {
      return column[rowIndex + 1]!;
    }
    return currentId;
  }

  if (direction === "up") {
    const column = grid[columnIndex]!;
    if (rowIndex > 0) {
      return column[rowIndex - 1]!;
    }
    return currentId;
  }

  if (direction === "left") {
    for (
      let nextColumnIndex = columnIndex - 1;
      nextColumnIndex >= 0;
      nextColumnIndex -= 1
    ) {
      const column = grid[nextColumnIndex]!;
      if (column.length === 0) {
        continue;
      }
      const targetRowIndex = Math.min(rowIndex, column.length - 1);
      return column[targetRowIndex]!;
    }
    return currentId;
  }

  for (
    let nextColumnIndex = columnIndex + 1;
    nextColumnIndex < grid.length;
    nextColumnIndex += 1
  ) {
    const column = grid[nextColumnIndex]!;
    if (column.length === 0) {
      continue;
    }
    const targetRowIndex = Math.min(rowIndex, column.length - 1);
    return column[targetRowIndex]!;
  }

  return currentId;
}
