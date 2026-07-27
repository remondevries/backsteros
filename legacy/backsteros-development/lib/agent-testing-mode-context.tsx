"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  AGENT_TESTING_MODE_CHANGED_EVENT,
  AGENT_TESTING_MODE_STORAGE_KEY,
  readAgentTestingMode,
  writeAgentTestingMode,
} from "@/lib/agent-testing-mode";

type AgentTestingModeContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const AgentTestingModeContext =
  createContext<AgentTestingModeContextValue | null>(null);

export function AgentTestingModeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    setEnabledState(readAgentTestingMode());
    function onStorage(event: StorageEvent) {
      if (event.key != null && event.key !== AGENT_TESTING_MODE_STORAGE_KEY) {
        return;
      }
      setEnabledState(readAgentTestingMode());
    }
    function onLocalChange() {
      setEnabledState(readAgentTestingMode());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(AGENT_TESTING_MODE_CHANGED_EVENT, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        AGENT_TESTING_MODE_CHANGED_EVENT,
        onLocalChange,
      );
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    writeAgentTestingMode(next);
    setEnabledState(next);
  }, []);

  const value = useMemo(
    () => ({ enabled, setEnabled }),
    [enabled, setEnabled],
  );

  return (
    <AgentTestingModeContext.Provider value={value}>
      {children}
    </AgentTestingModeContext.Provider>
  );
}

export function useAgentTestingMode(): AgentTestingModeContextValue {
  const value = useContext(AgentTestingModeContext);
  if (!value) {
    throw new Error(
      "useAgentTestingMode must be used within AgentTestingModeProvider",
    );
  }
  return value;
}
