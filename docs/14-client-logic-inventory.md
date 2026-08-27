# Client logic inventory (mobile ↔ desktop)

Audit of pure logic that is mirrored between `mobile/lib/` and
`desktop/packages/ui/` (or `desktop/src/`). Visual UI stays platform-owned —
only string/number/array helpers should move into `@backsteros/contracts`
(or a future `client-logic` package). See Wave B / Phase 7 of the desktop
quality plan.

**Rule:** JSX / CSS / platform APIs stay put. Pure functions → contracts.

| Logic domain | Desktop source | Mobile mirror | Already in contracts? | Action |
| --- | --- | --- | --- | --- |
| Inbox attention grouping | `ui/inbox/inbox-items.ts` | `mobile/lib/inbox-attention.ts` | Partial (`inbox-updated.ts`, `inbox-triage-notifications.ts`) | Move `taskBelongsInInbox`, attention group keys to contracts |
| Tasks due filters | `ui/tasks/tasks-due-filters.ts` | `mobile/lib/tasks-due-filters.ts` | No | **Unify first** — mobile has an extra `all` option; keep that as a mobile wrapper |
| Task due date YMD / meta | `ui/tasks/task-due-date.ts` | `mobile/lib/task-due-date.ts` | **Yes** (`client-logic/task-due-date.ts`: `formatLocalYmd`, `parseYmdLocal`, `getTaskDueDateYmd`) | Meta labels / urgency stay platform-local |
| Task status order / labels | `ui/tasks/…` | `mobile/lib/task-status.ts` | Partial (Zod enums) | Labels/order → contracts; colors stay UI |
| Email display ID | `ui/email/email-display-id.ts` | `mobile/lib/email-display-id.ts` | No | Single export in contracts |
| Email list / inbox rules | `ui/inbox/inbox-items.ts` | `mobile/lib/email-list.ts` | No | `emailBelongsInInbox` → contracts |
| Contact type helpers | `ui/…` | `mobile/lib/contact-type.ts` | Partial | Consolidate |
| Contact sections | `ui/…` | `mobile/lib/contact-sections.ts` | No | Extract pure section builders |
| Organization sections | `ui/…` | `mobile/lib/organization-sections.ts` | No | Extract |
| Project sections / areas | `ui/…` | `mobile/lib/project-sections.ts`, `project-areas.ts` | No | Extract |
| Project type / status | `ui/…` | `mobile/lib/project-type.ts`, `project-status.ts` | Partial | Consolidate |
| Group projects by area | `ui/…` | `mobile/lib/group-projects-by-area.ts` | No | Extract pure grouping |
| Alpha group | `ui/…` | `mobile/lib/alpha-group.ts` | No | Extract |
| Journal date helpers | `ui/journal/…` | `mobile/lib/journal.ts` | No | Extract date-slug helpers |
| Bank account groups | `ui/finance/…` | `mobile/lib/bank-account-groups.ts` | No | Extract |
| Finance chart series | `ui/finance/…` | `mobile/lib/finance-chart-series.ts` | No | Evaluate — may stay UI-specific if chart-shaped |
| Status header gradient math | `ui/tasks/task-status-header-gradient.ts` | `mobile/lib/status-header-gradient.ts` | No | Color math → contracts; CSS stays separate |
| Mention tokens / layout | `ui/…` | `mobile/lib/mention-tokens.ts`, `mention-layout.ts` | No | Tokens → contracts; layout may stay platform |
| REST ↔ PowerSync merge | `desktop/src/lib/merge-local-and-api.ts` | `mobile/lib/resolve-synced-or-rest-rows.ts` | No | Shared merge module (Phase 6.4) |
| Nav icons | `ui/sidebar-nav-icons.tsx` | `mobile/components/nav-icons.tsx` | **No — keep separate** | Visual parity by convention only |

## Priority extraction order (Phase 7b)

1. `tasks-due-filters` + `task-due-date`
2. Inbox attention / `taskBelongsInInbox` / email inbox rules
3. Email display id
4. Merge helpers (`mergeLocalAndApiByUpdatedAt`)
5. Remaining section/group helpers as needed

## Must not share

- React components (rows, panels, calendars, editors)
- CSS / Tailwind
- Tauri or Expo navigation glue
- Pierre / file-icon code generation

## Tracking

When a mirror is deleted, remove its row from this table and drop any
`Mirrors @backsteros/ui` comment in mobile.
