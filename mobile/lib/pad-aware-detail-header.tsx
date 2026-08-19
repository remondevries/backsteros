import type { ReactNode } from "react";

import { isPadDevice } from "./device";
import { FinanceDetailBackButton } from "./use-finance-detail-back";

type DetailHeaderOptions = {
  /** Kept for callers; title lives in scrolling content (`ContentPageTitle`). */
  title?: string;
  onBack: () => void;
  headerRight?: () => ReactNode;
};

/**
 * Finance (and similar) detail chrome.
 * Phone: back + optional trailing actions. iPad: trailing only (side nav).
 * Page titles scroll in content — not sticky in the native header.
 */
export function padAwareDetailHeaderOptions({
  onBack,
  headerRight,
}: DetailHeaderOptions) {
  const isPad = isPadDevice();
  const hasRight = Boolean(headerRight);
  return {
    header: undefined,
    headerShown: !isPad || hasRight,
    headerBackVisible: false,
    headerLeft: isPad
      ? () => null
      : () => <FinanceDetailBackButton onPress={onBack} />,
    headerTitleAlign: "left" as const,
    title: "",
    headerTitle: () => null,
    headerShadowVisible: false,
    ...(headerRight ? { headerRight } : null),
  };
}

/**
 * iPad finance section screens — no sticky title (scrolls in content).
 * Header only appears when there is a trailing action (+ / filter).
 */
export function financePadSectionHeaderOptions(options?: {
  /** @deprecated Titles scroll in content via `ContentPageTitle`. */
  title?: string;
  headerRight?: () => ReactNode;
}) {
  const hasRight = Boolean(options?.headerRight);
  return {
    header: undefined,
    headerShown: hasRight,
    headerBackVisible: false,
    headerLeft: () => null,
    headerTitleAlign: "left" as const,
    title: "",
    headerTitle: () => null,
    headerShadowVisible: false,
    ...(hasRight ? { headerRight: options!.headerRight } : null),
  };
}
