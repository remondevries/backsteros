"use client";

import { useEffect, useState, type FormEvent } from "react";

import { useAdminApi } from "@/lib/api-context";

type RecurringTask = {
  id: string;
  title: string;
  description: string | null;
  projectId: string | null;
  inbox: boolean;
  cronExpression: string;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Project = {
  id: string;
  key: string;
  name: string;
};

const PRESETS: Array<{ label: string; cron: string }> = [
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Daily 09:00 UTC", cron: "0 9 * * *" },
  { label: "Weekdays 09:00 UTC", cron: "0 9 * * 1-5" },
  { label: "Weekly Mon 09:00 UTC", cron: "0 9 * * 1" },
];

export default function RecurringPage() {
  const { requestJson } = useAdminApi();
  const [items, setItems] = useState<RecurringTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [cronExpression, setCronExpression] = useState("0 9 * * *");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      requestJson<{ recurringTasks: RecurringTask[] }>(
        "/api/v1/ops/recurring-tasks",
      ),
      requestJson<{ projects: Project[] }>("/api/v1/projects"),
    ])
      .then(([recurring, projectList]) => {
        if (!cancelled) {
          setItems(recurring.recurringTasks);
          setProjects(projectList.projects);
          setError(null);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestJson]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await requestJson<RecurringTask>(
        "/api/v1/ops/recurring-tasks",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            projectId: projectId || null,
            inbox: !projectId,
            cronExpression: cronExpression.trim(),
            enabled: true,
          }),
        },
      );
      setItems((prev) =>
        [...prev, created].sort(
          (a, b) =>
            new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime(),
        ),
      );
      setTitle("");
      setDescription("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(item: RecurringTask) {
    setError(null);
    try {
      const updated = await requestJson<RecurringTask>(
        `/api/v1/ops/recurring-tasks/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: !item.enabled }),
        },
      );
      setItems((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function removeItem(item: RecurringTask) {
    if (!window.confirm(`Delete recurring template “${item.title}”?`)) return;
    setError(null);
    try {
      await requestJson<void>(
        `/api/v1/ops/recurring-tasks/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      setItems((prev) => prev.filter((row) => row.id !== item.id));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const projectLabel = (id: string | null) => {
    if (!id) return "Inbox";
    const project = projects.find((row) => row.id === id);
    return project ? `${project.key} · ${project.name}` : id;
  };

  return (
    <div className="admin-page admin-page--wide">
      <header className="admin-page-header">
        <h1>Recurring tasks</h1>
        <p className="admin-muted">
          Templates the API cron runner turns into tasks on a UTC schedule.
          Useful for agent check-ins and other repeating work.
        </p>
      </header>

      {error ? (
        <div className="admin-card admin-card--error" role="alert">
          <strong>Request failed</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="admin-section">
        <h2>Create</h2>
        <form className="admin-card admin-form" onSubmit={handleCreate}>
          <label className="admin-field">
            <span>Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Weekly review"
              required
              maxLength={500}
            />
          </label>
          <label className="admin-field">
            <span>Description (optional)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={10_000}
            />
          </label>
          <label className="admin-field">
            <span>Project</span>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">Inbox</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.key} · {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Cron (UTC)</span>
            <input
              value={cronExpression}
              onChange={(event) => setCronExpression(event.target.value)}
              placeholder="0 9 * * *"
              required
              spellCheck={false}
            />
          </label>
          <div className="admin-preset-row">
            {PRESETS.map((preset) => (
              <button
                key={preset.cron}
                type="button"
                className="admin-chip"
                onClick={() => setCronExpression(preset.cron)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="admin-muted">
            Five fields: minute hour day-of-month month day-of-week.
          </p>
          <button
            type="submit"
            className="admin-button admin-button--primary"
            disabled={saving || !title.trim()}
          >
            {saving ? "Creating…" : "Create recurring task"}
          </button>
        </form>
      </section>

      <section className="admin-section">
        <h2>Scheduled</h2>
        {loading ? <p className="admin-muted">Loading…</p> : null}
        {!loading && items.length === 0 ? (
          <p className="admin-muted">No recurring templates yet.</p>
        ) : null}
        {items.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Cron</th>
                  <th>Target</th>
                  <th>Next run</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="admin-cell-stack">
                        <strong>{item.title}</strong>
                        {item.lastTaskId ? (
                          <span className="admin-muted">
                            Last task <code>{item.lastTaskId}</code>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <code>{item.cronExpression}</code>
                    </td>
                    <td>{projectLabel(item.projectId)}</td>
                    <td>{new Date(item.nextRunAt).toLocaleString()}</td>
                    <td>{item.enabled ? "enabled" : "paused"}</td>
                    <td className="admin-table-actions">
                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => void toggleEnabled(item)}
                      >
                        {item.enabled ? "Pause" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="admin-button admin-button--danger"
                        onClick={() => void removeItem(item)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
