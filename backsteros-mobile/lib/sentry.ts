type SentryExtras = Record<string, unknown>;

type SentryLike = {
  init: (options: {
    dsn: string;
    enableInExpoDevelopment?: boolean;
    tracesSampleRate?: number;
  }) => void;
  captureException: (error: unknown, context?: { extra?: SentryExtras }) => void;
  wrap: <T>(component: T) => T;
};

let sentry: SentryLike | null = null;
let initAttempted = false;

function readDsn(): string {
  const fromProcess = (
    globalThis as { process?: { env?: Record<string, string> } }
  ).process?.env?.EXPO_PUBLIC_SENTRY_DSN;
  return (fromProcess ?? "").trim();
}

/**
 * Optional Sentry. No-ops when `EXPO_PUBLIC_SENTRY_DSN` is unset so local
 * builds stay free of a required crash-reporting account.
 */
export function initSentry(): void {
  if (initAttempted) return;
  initAttempted = true;
  const dsn = readDsn();
  if (!dsn) return;

  try {
    // Lazy require keeps the module optional until a DSN is configured.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@sentry/react-native") as SentryLike;
    mod.init({
      dsn,
      enableInExpoDevelopment: false,
      tracesSampleRate: 0.15,
    });
    sentry = mod;
  } catch {
    sentry = null;
  }
}

export function captureException(
  error: unknown,
  extra?: SentryExtras,
): void {
  if (!sentry) {
    if (__DEV__) {
      console.warn("[sentry]", error, extra);
    }
    return;
  }
  sentry.captureException(error, extra ? { extra } : undefined);
}

export function wrapRoot<T>(component: T): T {
  if (!sentry) return component;
  return sentry.wrap(component);
}
