# @backsteros/ui

Shared product UI and domain helpers for **web** (`backsteros-app`) and
**desktop** (`backsteros-desktop`). Framework-agnostic React — no `next/*`.

See ADR-019 and `docs/05-clients.md`.

## Styling (Tailwind)

Apps own Tailwind compilation. Shared components may use Tailwind utility
classes; each app must:

1. `@import "tailwindcss"`
2. `@import "@backsteros/ui/tailwind.css"` (registers `@source` for this package)
3. Import `@backsteros/ui/styles.css` for non-utility / legacy component CSS

Do **not** ship a second compiled Tailwind utilities layer from this package.

## Contents (v0)

- Task status / priority helpers
- `TaskStatusIcon`, `TaskStatusBadge`, `TaskListItem`
- Shared list styles via `@backsteros/ui/styles.css`
- Detail skeletons and other product chrome shared by web + desktop

## Usage

```ts
import { TaskListItem, TaskStatusIcon } from "@backsteros/ui";
import "@backsteros/ui/styles.css";
```

In the app CSS entry (Next `globals.css`, desktop `app.css`):

```css
@import "tailwindcss";
@import "@backsteros/ui/tailwind.css";
```
