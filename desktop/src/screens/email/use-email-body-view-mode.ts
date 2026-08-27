import { useCallback, useState } from "react";
import type { EmailThreadBodyViewMode } from "@backsteros/ui";
import { useEmailBodyViewModeShortcuts } from "@backsteros/ui";

import {
  EMAIL_THREAD_BODY_VIEW_MODE_KEY,
  readEmailThreadBodyViewMode,
} from "./email-page-helpers";

export function useEmailBodyViewMode(options?: {
  shortcutsEnabled?: boolean;
  pathname?: string;
}) {
  const [bodyViewMode, setBodyViewMode] = useState<EmailThreadBodyViewMode>(
    () => readEmailThreadBodyViewMode(),
  );

  const handleBodyViewModeChange = useCallback((next: EmailThreadBodyViewMode) => {
    setBodyViewMode(next);
    try {
      window.localStorage.setItem(EMAIL_THREAD_BODY_VIEW_MODE_KEY, next);
    } catch {
      // ignore storage failures
    }
  }, []);

  useEmailBodyViewModeShortcuts({
    bodyViewMode,
    onBodyViewModeChange: handleBodyViewModeChange,
    enabled: options?.shortcutsEnabled ?? false,
    pathname: options?.pathname,
  });

  return {
    bodyViewMode,
    handleBodyViewModeChange,
  };
}
