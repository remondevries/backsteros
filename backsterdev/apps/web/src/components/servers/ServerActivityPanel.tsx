import { useCallback, useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { fetchServerActivity, type ServerActivityItem } from "./hetznerApi";

function formatRelativeTime(iso: string, nowMs = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;

  const deltaSeconds = Math.round((then - nowMs) / 1000);
  const abs = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (abs < 60) return formatter.format(deltaSeconds, "second");
  const minutes = Math.round(deltaSeconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return formatter.format(months, "month");
  return formatter.format(Math.round(days / 365), "year");
}

function avatarTone(status: ServerActivityItem["status"]): string {
  if (status === "error") return "bg-destructive/90 text-white";
  if (status === "running") return "bg-amber-600 text-white";
  return "bg-[#3b5bdb] text-white";
}

export function ServerActivityPanel({ serverId }: { readonly serverId: string }) {
  const [items, setItems] = useState<readonly ServerActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchServerActivity(serverId);
      if (!data.ok && data.error) {
        setError(data.error);
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load activity");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      {loading ? (
        <div className="px-6 py-10 text-sm text-muted-foreground">Loading activity…</div>
      ) : error ? (
        <div className="px-6 py-10 text-sm text-destructive">{error}</div>
      ) : items.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">
          No server activity yet.
        </div>
      ) : (
        <ul className="px-5 py-4 sm:px-6">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={item.id} className="relative flex gap-4 py-3.5">
                {!isLast ? (
                  <span
                    className="absolute top-10 bottom-0 left-[1.15rem] w-px bg-border/70"
                    aria-hidden
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-10 mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide",
                    avatarTone(item.status),
                  )}
                  aria-hidden
                >
                  {item.actorInitials}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                    {item.errorMessage ? (
                      <div className="mt-1 truncate text-xs text-destructive">
                        {item.errorMessage}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-sm text-muted-foreground">
                    {formatRelativeTime(item.startedAt)} by{" "}
                    <span className="text-foreground/90">{item.actorName}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
