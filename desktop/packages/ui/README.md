# @backsteros/ui (desktop-owned)

Product UI helpers for **desktop** (`desktop/`) only.

v2 does **not** share visual components with Expo mobile. This package lives under
`desktop/packages/ui/` so the desktop shell can keep iterating without a
cross-platform UI monorepo.

Legacy Next apps that once imported this package are archived at
`~/code/archive/backsteros-legacy/` (outside this workspace).

## Styling (Tailwind)

The desktop app owns Tailwind compilation. Components may use Tailwind utility
classes; desktop must:

1. `@import "tailwindcss"`
2. `@import "@backsteros/ui/tailwind.css"` (registers `@source` for this package)
3. Import `@backsteros/ui/styles.css` for non-utility / legacy component CSS

## Usage

```ts
import { TaskListItem, TaskStatusIcon } from "@backsteros/ui";
import "@backsteros/ui/styles.css";
```
