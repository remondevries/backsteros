import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import { getMobileEnvironment } from "./env";
import {
  formatMobileApiNetworkError,
  isMobileApiNetworkError,
  probeCoreReachability,
  resolveCoreApiUrl,
} from "./probe-core-health";

export type CoreApiMode = "resolving" | "local" | "cloud";

type MobileCoreApiUrlState = {
  localApiUrl: string;
  cloudApiUrl: string | null;
  activeApiUrl: string;
  coreMode: CoreApiMode;
  recheck: () => Promise<void>;
  formatNetworkError: () => string;
  isNetworkError: (detail: string) => boolean;
};

const CLOUD_RECHECK_INTERVAL_MS = 45_000;

const defaultState: MobileCoreApiUrlState = {
  localApiUrl: getMobileEnvironment().localApiUrl,
  cloudApiUrl: getMobileEnvironment().cloudApiUrl,
  activeApiUrl: getMobileEnvironment().localApiUrl,
  coreMode: "resolving",
  recheck: async () => {},
  formatNetworkError: () => "Cannot reach API.",
  isNetworkError: isMobileApiNetworkError,
};

const MobileCoreApiUrlContext =
  createContext<MobileCoreApiUrlState>(defaultState);

export function MobileCoreApiUrlProvider({ children }: { children: ReactNode }) {
  const { localApiUrl, cloudApiUrl } = getMobileEnvironment();
  const [activeApiUrl, setActiveApiUrl] = useState(localApiUrl);
  const [coreMode, setCoreMode] = useState<CoreApiMode>("resolving");
  const probeGenerationRef = useRef(0);
  const recheckInFlightRef = useRef<Promise<void> | null>(null);

  const applyResolution = useCallback(
    (input: { localReachable: boolean; cloudReachable: boolean }) => {
      const resolved = resolveCoreApiUrl({
        localReachable: input.localReachable,
        cloudReachable: input.cloudReachable,
        localApiUrl,
        cloudApiUrl,
      });
      setActiveApiUrl((prev) =>
        prev === resolved.activeApiUrl ? prev : resolved.activeApiUrl,
      );
      setCoreMode((prev) =>
        prev === resolved.coreMode ? prev : resolved.coreMode,
      );
      if (resolved.coreMode === "cloud") {
        console.info(
          `[mobile] local core offline — REST fallback to cloud (${resolved.activeApiUrl})`,
        );
      }
    },
    [cloudApiUrl, localApiUrl],
  );

  const recheck = useCallback(async () => {
    if (recheckInFlightRef.current) {
      await recheckInFlightRef.current;
      return;
    }

    const generation = ++probeGenerationRef.current;
    const run = (async () => {
      const reachability = await probeCoreReachability({
        localApiUrl,
        cloudApiUrl,
      });
      if (generation !== probeGenerationRef.current) return;
      applyResolution(reachability);
    })();

    recheckInFlightRef.current = run;
    try {
      await run;
    } finally {
      if (recheckInFlightRef.current === run) {
        recheckInFlightRef.current = null;
      }
    }
  }, [applyResolution, cloudApiUrl, localApiUrl]);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (next === "active") void recheck();
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, [recheck]);

  useEffect(() => {
    if (coreMode !== "cloud" || !cloudApiUrl) return;
    const timer = setInterval(() => {
      void recheck();
    }, CLOUD_RECHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [cloudApiUrl, coreMode, recheck]);

  const value = useMemo<MobileCoreApiUrlState>(
    () => ({
      localApiUrl,
      cloudApiUrl,
      activeApiUrl,
      coreMode,
      recheck,
      formatNetworkError: () =>
        formatMobileApiNetworkError({
          activeApiUrl,
          localApiUrl,
          cloudApiUrl,
          coreMode,
        }),
      isNetworkError: isMobileApiNetworkError,
    }),
    [activeApiUrl, cloudApiUrl, coreMode, localApiUrl, recheck],
  );

  return (
    <MobileCoreApiUrlContext.Provider value={value}>
      {children}
    </MobileCoreApiUrlContext.Provider>
  );
}

export function useMobileCoreApiUrl() {
  return useContext(MobileCoreApiUrlContext);
}
