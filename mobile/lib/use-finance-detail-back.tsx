import { useCallback } from "react";
import { useRouter } from "expo-router";

import { rememberFinanceSection } from "./finance-section-memory";
import type { MobileFinanceSectionId } from "./finance-sections";
import { TabStackHeaderBackButton } from "./tab-stack-options";

/**
 * Pop the finance stack detail, or replace to the Finance home shell when
 * there is no history (deep link / remount). Remembers the section so the
 * phone shell restores Accounts/Categories instead of Dashboard.
 */
export function useFinanceDetailBack(section: MobileFinanceSectionId) {
  const router = useRouter();

  return useCallback(() => {
    rememberFinanceSection(section);
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/finance");
  }, [router, section]);
}

/** Explicit header back — shared centered control (see TabStackHeaderBackButton). */
export function FinanceDetailBackButton({ onPress }: { onPress: () => void }) {
  return <TabStackHeaderBackButton onPress={onPress} />;
}
