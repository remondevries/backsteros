import { useMemo } from "react";

import { TransactionList } from "./finance/transaction-list";
import { useFinanceCategories } from "../lib/use-finance-categories";

type Props = {
  organizationId: string;
};

export function OrganizationTransactionsPanel({ organizationId }: Props) {
  const categories = useFinanceCategories();
  const baseFilters = useMemo(
    () => ({ organizationId }),
    [organizationId],
  );

  return (
    <TransactionList
      baseFilters={baseFilters}
      categories={categories.rows}
      emptyText="No transactions linked to this organization."
    />
  );
}
