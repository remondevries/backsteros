import {
  WorkerPoolContextProvider,
  useWorkerPool,
} from "@pierre/diffs/react";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  resolveDiffThemeName,
  type DiffThemeName,
} from "../../codebase/pierre-diff-rendering.js";

const PREFERRED_HIGHLIGHTER = "shiki-wasm" as const;

function DiffWorkerThemeSync({ themeName }: { themeName: DiffThemeName }) {
  const workerPool = useWorkerPool();

  useEffect(() => {
    if (!workerPool) return;

    void (async () => {
      try {
        const current = workerPool.getDiffRenderOptions();
        if (current.theme === themeName) return;
        await workerPool.setRenderOptions({
          ...current,
          theme: themeName,
        });
      } catch (cause) {
        console.error("Pierre diff worker theme sync failed", cause);
      }
    })();
  }, [themeName, workerPool]);

  return null;
}

function DiffWorkerReady({ children }: { children?: ReactNode }) {
  const workerPool = useWorkerPool();
  const [ready, setReady] = useState(
    () => !workerPool || workerPool.isInitialized() || !workerPool.isWorkingPool(),
  );

  useEffect(() => {
    if (ready || !workerPool) return;

    let mounted = true;
    const finish = () => {
      if (mounted) setReady(true);
    };
    void workerPool.initialize().then(finish, finish);
    return () => {
      mounted = false;
    };
  }, [ready, workerPool]);

  if (!ready) {
    return (
      <p className="console-github-pane-status" role="status">
        Loading code…
      </p>
    );
  }

  return children;
}

/**
 * Desktop Pierre worker pool — mirrors BacksterDEV DiffWorkerPoolProvider
 * without Effect Schema wrappers.
 */
export function PierreDiffWorkerPoolProvider({
  children,
  theme = "dark",
}: {
  children?: ReactNode;
  theme?: "light" | "dark";
}) {
  const diffThemeName = resolveDiffThemeName(theme);
  const workerPoolSize = useMemo(() => {
    const cores =
      typeof navigator === "undefined" ? 4 : Math.max(1, navigator.hardwareConcurrency || 4);
    return Math.max(2, Math.min(6, Math.floor(cores / 2)));
  }, []);

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => new DiffsWorker(),
        poolSize: workerPoolSize,
        totalASTLRUCacheSize: 240,
      }}
      highlighterOptions={{
        theme: diffThemeName,
        preferredHighlighter: PREFERRED_HIGHLIGHTER,
        tokenizeMaxLineLength: 1_000,
        useTokenTransformer: true,
      }}
    >
      <DiffWorkerThemeSync themeName={diffThemeName} />
      <DiffWorkerReady>{children}</DiffWorkerReady>
    </WorkerPoolContextProvider>
  );
}
