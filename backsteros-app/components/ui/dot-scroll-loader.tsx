"use client";

import { useEffect, useState } from "react";

/** 5×5 grid parsed from the Linear-style reference SVG (true = bright, false = dim). */
const INITIAL_GRID: boolean[][] = [
  [true, true, true, false, false],
  [true, true, true, true, false],
  [true, true, false, false, false],
  [true, true, true, false, false],
  [true, false, false, false, false],
];

function shiftRowsUp(grid: boolean[][]): boolean[][] {
  return [grid[1], grid[2], grid[3], grid[4], grid[0]].map((row) => [...row!]);
}

type DotScrollLoaderProps = {
  className?: string;
  intervalMs?: number;
  squareDots?: boolean;
  status?: "working" | "waiting";
  "aria-label"?: string;
};

export function DotScrollLoader({
  className,
  intervalMs = 140,
  squareDots = false,
  status = "working",
  "aria-label": ariaLabel = "Loading",
}: DotScrollLoaderProps) {
  const [grid, setGrid] = useState(INITIAL_GRID);
  const displayGrid = status === "working" ? grid : INITIAL_GRID;

  useEffect(() => {
    if (status !== "working") {
      return;
    }

    const timer = window.setInterval(() => {
      setGrid((current) => shiftRowsUp(current));
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, status]);

  return (
    <svg
      className={[
        "dot-scroll-loader",
        status === "waiting" ? "dot-scroll-loader--waiting" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
    >
      {displayGrid.map((row, rowIndex) =>
        row.map((bright, colIndex) => (
          <rect
            key={`${rowIndex}-${colIndex}`}
            x={1 + colIndex * 3}
            y={1 + rowIndex * 3}
            width="2"
            height="2"
            rx={squareDots ? 0 : 1}
            className={
              bright
                ? "dot-scroll-loader-dot dot-scroll-loader-dot-bright"
                : "dot-scroll-loader-dot dot-scroll-loader-dot-dim"
            }
          />
        )),
      )}
    </svg>
  );
}
