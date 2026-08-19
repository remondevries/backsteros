import type {
  FinancialGoalListing,
  FinancialGoalSavingMode,
} from "@backsteros/contracts";
import { useCallback, useMemo, useState } from "react";

import { fetchFinancialGoals } from "./finance-api";
import { useMobilePowerSync } from "./powersync-context";
import { resolveSyncedOrRestRows } from "./resolve-synced-or-rest-rows";
import { useLocalQuery } from "./use-local-query";
import { useMobileApiClient } from "./use-mobile-api-client";
import { useRestListHydration } from "./use-rest-list-hydration";
import { useRestReloadFlags } from "./use-rest-reload-flags";

export type FinanceGoalRow = {
  id: string;
  name: string;
  listing: FinancialGoalListing;
  icon: string | null;
  goalAmountCents: number | null;
  startDate: string | null;
  endDate: string | null;
  contributionCents: number | null;
  savingMode: FinancialGoalSavingMode;
  /** REST-computed; 0 when only local PowerSync row is available. */
  savedCents: number;
  sortOrder: number;
};

type SyncedGoalRow = {
  id: string;
  name: string | null;
  listing: string | null;
  icon: string | null;
  goal_amount_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  contribution_cents: number | null;
  saving_mode: string | null;
  sort_order: number | null;
};

const GOALS_SQL = `SELECT id, name, listing, icon, goal_amount_cents, start_date,
   end_date, contribution_cents, saving_mode, sort_order
 FROM financial_goals
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

function asListing(value: string | null): FinancialGoalListing {
  if (value === "ready_to_spend" || value === "archive") return value;
  return "active";
}

function asSavingMode(value: string | null): FinancialGoalSavingMode {
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "yearly"
  ) {
    return value;
  }
  return "monthly";
}

function mapLocal(rows: SyncedGoalRow[]): FinanceGoalRow[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name?.trim() || "Untitled",
    listing: asListing(row.listing),
    icon: row.icon,
    goalAmountCents: row.goal_amount_cents,
    startDate: row.start_date,
    endDate: row.end_date,
    contributionCents: row.contribution_cents,
    savingMode: asSavingMode(row.saving_mode),
    savedCents: 0,
    sortOrder: row.sort_order ?? 0,
  }));
}

function mapRest(
  goals: Awaited<ReturnType<typeof fetchFinancialGoals>>,
): FinanceGoalRow[] {
  return goals.map((goal) => ({
    id: goal.id,
    name: goal.name.trim() || "Untitled",
    listing: goal.listing,
    icon: goal.icon,
    goalAmountCents: goal.goalAmountCents,
    startDate: goal.startDate,
    endDate: goal.endDate,
    contributionCents: goal.contributionCents,
    savingMode: goal.savingMode,
    savedCents: goal.savedCents,
    sortOrder: goal.sortOrder,
  }));
}

/**
 * Financial goals — PowerSync Tier B + REST merge for `savedCents`.
 */
export function useFinanceGoals() {
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<SyncedGoalRow>(GOALS_SQL);
  const [restRows, setRestRows] = useState<FinanceGoalRow[] | null>(null);
  const [restError, setRestError] = useState<string | null>(null);
  const {
    restLoading,
    pullRefreshing,
    beginReload,
    endReload,
    markHydrated,
  } = useRestReloadFlags();

  const localRows = useMemo(
    () => mapLocal(syncedRows ?? []),
    [syncedRows],
  );

  const reloadRest = useCallback(async (opts?: { userPull?: boolean }) => {
    const userPull = beginReload(opts);
    setRestError(null);
    try {
      setRestRows(mapRest(await fetchFinancialGoals(client)));
      markHydrated();
    } catch (reason) {
      setRestError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      endReload(userPull);
    }
  }, [beginReload, client, endReload, markHydrated]);

  useRestListHydration(reloadRest);

  const baseRows = resolveSyncedOrRestRows({
    localRows,
    restRows,
    connected: powerSync.connected,
  });

  // Overlay REST savedCents onto whichever membership we display.
  const savedById = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of restRows ?? []) map.set(row.id, row.savedCents);
    return map;
  }, [restRows]);

  const rows = useMemo(
    () =>
      baseRows.map((row) => ({
        ...row,
        savedCents: savedById.get(row.id) ?? row.savedCents,
      })),
    [baseRows, savedById],
  );

  const useRest =
    (!powerSync.connected && restRows != null) ||
    (localRows.length === 0 && restRows != null);

  const waitingForSync =
    rows.length === 0 &&
    restRows == null &&
    (powerSync.status === "connecting" ||
      powerSync.status === "idle" ||
      syncLoading);

  const loading =
    rows.length === 0 && (restLoading || waitingForSync || syncLoading);
  const error =
    rows.length === 0 && restError && !powerSync.connected ? restError : null;

  const reload = useCallback(async () => {
    await reloadRest({ userPull: true });
  }, [reloadRest]);

  return {
    rows,
    loading,
    error,
    useRest,
    pullRefreshing,
    /** @deprecated Prefer `pullRefreshing` for RefreshControl. */
    restLoading: pullRefreshing,
    reload,
  };
}
