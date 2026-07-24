const STORAGE_KEY = "backsteros-development.agent-testing-mode";

export const AGENT_TESTING_MODE_STORAGE_KEY = STORAGE_KEY;

export const AGENT_TESTING_MODE_CHANGED_EVENT =
  "backsteros-development:agent-testing-mode-changed";

export function readAgentTestingMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAgentTestingMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(
      new CustomEvent(AGENT_TESTING_MODE_CHANGED_EVENT, {
        detail: { enabled },
      }),
    );
  } catch {
    /* ignore quota */
  }
}
