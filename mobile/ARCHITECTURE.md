# Mobile app architecture

BacksterOS mobile (`mobile/`) is an Expo SDK 55 + React Native client for iPhone and iPad. It shares **contracts only** with desktop — no shared visual UI (`docs/05-clients.md`).

## Layers

```text
app/           Expo Router — thin route files only
components/    Screens and feature UI (prefer components/<feature>/)
lib/           Hooks, data helpers, pure logic (unit-tested)
```

### Data flow

```text
PowerSync SQLite (local-core)  ←→  useLocalQuery / useSyncedOrRest
REST (activeApiUrl)            ←→  useMobileApiClient + cloud fallback
```

- **Prefer PowerSync** for Tier A/B lists and metadata when `powerSync.connected`.
- **REST fallback** when sync is offline or cold-empty (`restFallbackAllowed` in `powersync-context.tsx`).
- **Cloud fallback**: `EXPO_PUBLIC_CLOUD_API_URL` when local-core `/health` fails (`api-url-context.tsx`). PowerSync still targets local-core only.

## Lists

Always use primitives under `components/lists/`:

| Primitive | Use for |
| --- | --- |
| `BacksterFlashList` | Flat lists (journal, contacts, documents) |
| `BacksterGroupedList` | Status/type sections with sticky headers (tasks, projects, finance) |

Do not import `FlatList` / `SectionList` in product screens — only inside `components/lists/` (or pass `embedded` on `BacksterFlashList` for workbench panes).

Keyboard nav (j/k): `useListJkNavigation` + `findFlatGroupedRowIndex` / `scrollFlashListToItemId`.

RTL component smoke tests are deferred; list/nav helpers are covered by `tsx --test` unit tests.

## iPad layout

| Helper | When |
| --- | --- |
| `isPadDevice()` | True iPad chrome (tab tray, split eligibility) |
| `useCompactLayout()` | Narrow width (Slide Over) — phone-density rows |
| `PadSplitLayout` | Master-detail shell (list pane + detail stack) |

Journal and inbox use `PadSplitLayout` from `lib/layout/`.

## Navigation

- **Tab stacks** — `(app)/<tab>/` for primary surfaces.
- **Root stack** — `task/[id]`, `document/[id]`, etc. for cross-tab deep links after create flows.

## Media

- Remote images in lists: `expo-image` via `components/avatar-image.tsx`.
- Avatar downloads: bounded concurrency in `use-entity-avatar-src.ts`.

## Native modules

- **OP-SQLite** + PowerSync for production SQLite (New Architecture).
- **SQL.js** fallback only for Expo Go or OP-SQLite thread recovery — not production.
- **Ghostty** (`expo-libghostty`) for agent TUI — requires native rebuild after changes.

## Release checklist

1. App opens (local-shell bearer — no sign-in)
2. Inbox/tasks list scroll (200+ rows if available)
3. iPad split: auto-select first row, collapse list rail
4. Local-core offline → cloud REST fallback (if `EXPO_PUBLIC_CLOUD_API_URL` set)
5. Agent TUI open on iPad codebase task
6. `pnpm --filter @backsteros/mobile typecheck && test`

## SDK

- **Expo SDK 55** / React Native 0.83 / New Architecture mandatory
- **React Compiler** enabled in `app.json` `experiments.reactCompiler`
- Re-run `prebuild` after native dependency changes
