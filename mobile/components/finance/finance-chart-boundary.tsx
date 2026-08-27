import type { ReactNode } from "react";

import { FeatureErrorBoundary } from "../feature-error-boundary";

export function FinanceChartBoundary({ children }: { children: ReactNode }) {
  return (
    <FeatureErrorBoundary title="Finance chart">
      {children}
    </FeatureErrorBoundary>
  );
}
