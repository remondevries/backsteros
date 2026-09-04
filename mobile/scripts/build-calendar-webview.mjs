import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const entry = path.join(root, "calendar-grid-webview/src/main.ts");
const outDir = path.join(root, "lib/generated");
const outFile = path.join(outDir, "calendar-grid-html.ts");

mkdirSync(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
});

const js = result.outputFiles?.[0]?.text;
if (!js) {
  throw new Error("esbuild produced no output");
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link href="https://cdn.jsdelivr.net/npm/@fullcalendar/core@6.1.21/index.global.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/@fullcalendar/daygrid@6.1.21/index.global.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/@fullcalendar/timegrid@6.1.21/index.global.min.css" rel="stylesheet" />
  <style>
    :root {
      --background: #000000;
      --foreground: #ededed;
      --surface: #111112;
      --muted: rgba(255, 255, 255, 0.52);
      --calendar-grid-border: color-mix(in srgb, var(--foreground) 14%, var(--background));
    }
    html, body, #calendar {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: var(--background);
      color: var(--foreground);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .fc {
      --fc-border-color: var(--calendar-grid-border);
      --fc-page-bg-color: transparent;
      --fc-neutral-bg-color: transparent;
      --fc-non-business-color: transparent;
      --fc-neutral-text-color: var(--muted);
      --fc-event-bg-color: var(--surface);
      --fc-event-border-color: color-mix(in srgb, var(--foreground) 8%, transparent);
      --fc-event-text-color: var(--foreground);
      --fc-today-bg-color: transparent;
      --fc-now-indicator-color: #e5534b;
      --fc-highlight-color: color-mix(in srgb, #ee7a47 16%, transparent);
      --fc-list-event-hover-bg-color: color-mix(in srgb, var(--foreground) 6%, transparent);
      background: transparent;
      color: var(--foreground);
      font-size: 0.8125rem;
    }
    .fc .fc-scrollgrid,
    .fc .fc-timegrid-body,
    .fc .fc-timegrid-slots,
    .fc .fc-daygrid-body,
    .fc .fc-col-header,
    .fc td,
    .fc th {
      background: transparent !important;
    }
    .fc .fc-col-header-cell-cushion,
    .fc .fc-daygrid-day-number,
    .fc .fc-timegrid-slot-label-cushion {
      color: var(--muted);
      text-decoration: none;
    }
    /* Day view already has the week strip — hide FC's Today/date column title. */
    .fc-timeGridDay-view .fc-col-header,
    .fc-timeGridDay-view .fc-timegrid-divider {
      display: none;
    }
    .task-calendar-event {
      border-radius: 4px;
      border-width: 1px;
      border-style: solid;
      --task-calendar-event-bg: var(--surface);
      background-color: var(--task-calendar-event-bg) !important;
      border-color: color-mix(in srgb, var(--foreground) 8%, transparent) !important;
    }
    .task-calendar-event .fc-event-main {
      color: var(--foreground);
      background: transparent !important;
      height: 100%;
    }
    .fc .fc-daygrid-event.task-calendar-event,
    .fc .fc-h-event.task-calendar-event {
      box-sizing: border-box;
      overflow: hidden;
      margin-top: 3px;
    }
    .fc .fc-daygrid-event.task-calendar-event .fc-event-main,
    .fc .fc-h-event.task-calendar-event .fc-event-main {
      background: transparent !important;
      border-radius: inherit;
    }
    .task-calendar-event__content {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      height: 100%;
      padding: 1px 4px;
      box-sizing: border-box;
    }
    .task-calendar-event__row {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      width: 100%;
    }
    .task-calendar-event__status-dot {
      flex: 0 0 auto;
      width: 8px;
      height: 8px;
      border-radius: 999px;
    }
    .task-calendar-event__time {
      flex: 0 0 auto;
      color: var(--muted);
      font-size: 11px;
      font-weight: 500;
    }
    .task-calendar-event__title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 500;
      color: var(--foreground);
    }
    .task-calendar-event-done {
      opacity: 0.55;
    }
    .task-calendar-event-done .task-calendar-event__title {
      text-decoration: line-through;
    }
    .fc .birthday-calendar-event .task-calendar-event__title {
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div id="calendar"></div>
  <script>
${js}
  </script>
</body>
</html>`;

const moduleSource = `/* Generated by scripts/build-calendar-webview.mjs — do not edit by hand. */
export const CALENDAR_GRID_HTML = ${JSON.stringify(html)};
`;

writeFileSync(outFile, moduleSource, "utf8");
console.log(
  `Wrote ${path.relative(root, outFile)} (${Math.round(html.length / 1024)} KB HTML)`,
);
