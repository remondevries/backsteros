# @backsteros/cli

Thin command-line client for BacksterOS **tasks**, **projects**, and **comments**. Built for agents and local shell use; wraps the same REST API as the apps.

## Install on PATH

```bash
pnpm --filter @backsteros/cli build
./core/packages/cli/scripts/install-cli.sh
# → ~/.local/bin/backsteros
```

Auth defaults load from `~/.config/backsteros/cli.env` (no 1Password required).

| Resource | Actions |
| --- | --- |
| `project` | `list` `get` `create` `update` `delete` |
| `task` | `list` `get` `create` `update` `delete` |
| `comment` | `list` `get` `create` `update` `delete` |

Task refs accept a UUID or display id (`DOT-1`). Project refs accept a UUID or key (`DOT`).

## Auth

| Source | Default |
| --- | --- |
| `--url` / `BACKSTEROS_API_URL` | `http://127.0.0.1:8788` |
| `--token` / `BACKSTEROS_API_KEY` / `LOCAL_SHELL_TOKEN` | `local` (local-core shell auth) |
| `--actor` / `BACKSTEROS_ACTIVITY_ACTOR` | `agent` |

Use a scoped `sk_live_…` key when talking to cloud-core / `agent.backsteros.com`.

## Examples

```bash
backsteros project list
backsteros task create --project DOT --title "Try the CLI" --status ready_to_start
backsteros comment create DOT-1 --message "Finished; screen may sleep, processes stay awake."
backsteros comment list DOT-1
backsteros comment update DOT-1 <comment-id> --message "Edited note."
backsteros comment delete DOT-1 <comment-id>
backsteros task update DOT-1 --status completed
```

On project/task, `--body '{"priority":3}'` merges arbitrary JSON into create/update payloads.
On comment, `--message` / `-m` (or `--body`) is the comment text.
