import {
  Component,
  createContext,
  Fragment,
  memo,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type {
  EmailComposeReplyTemplates,
  EmailListItem,
  EmailMailbox,
} from "@backsteros/ui";

import { shouldLiveUpdateAgentMail } from "./agentmail-live";
import {
  getVisibleKeepAliveSurface,
  subscribeWarmKeepAliveChrome,
} from "./shell-warm-keep-alive";
import { useAgentMailMailboxes } from "./use-agentmail-mailboxes";

type AgentMailContextValue = {
  mailboxes: EmailMailbox[];
  messages: EmailListItem[];
  apiKeyConfigured: boolean;
  /** Workspace reply greeting/sign-off templates for compose preview. */
  replyTemplates: EmailComposeReplyTemplates | null;
  loading: boolean;
  messagesLoading: boolean;
  reload: () => Promise<void>;
  /**
   * True while the live provider is crashed and the shell is on the empty stub.
   * Sidebar shows a reconnecting alert; auto-retry clears this on recovery.
   * Missing-provider / HMR stubs leave this false (AgentMail is usually fine).
   */
  degraded: boolean;
};

/** Empty mail state so the shell stays up when the provider is missing or crashed. */
function agentMailStub(degraded: boolean): AgentMailContextValue {
  return {
    mailboxes: [],
    messages: [],
    apiKeyConfigured: false,
    replyTemplates: null,
    loading: false,
    messagesLoading: false,
    reload: async () => {},
    degraded,
  };
}

/** HMR / missing-provider — empty lists, no scary sidebar alert. */
const AGENT_MAIL_MISSING_STUB = agentMailStub(false);

/** Provider crash — empty lists + sidebar alert until auto-retry recovers. */
const AGENT_MAIL_CRASH_STUB = agentMailStub(true);

const AGENTMAIL_FAST_RETRIES = 3;
const AGENTMAIL_FAST_RETRY_MS = 1_500;
const AGENTMAIL_SLOW_RETRY_MS = 30_000;

const AgentMailContext = createContext<AgentMailContextValue | null>(null);

let warnedMissingProvider = false;

const MemoizedChildren = memo(function MemoizedChildren({
  children,
}: {
  children: ReactNode;
}) {
  return children;
});

/**
 * Shared AgentMail list for Inbox, Tasks, and project task surfaces so email
 * rows stay in sync without duplicate fetches.
 *
 * Enable from the keep-alive store (inbox) or the window href (email/compose
 * Outlet). Sticky for the session. Live rebuilds start after the inbox list
 * paints. Hidden inbox does not live-rebuild the list or chrome.
 *
 * Failures inside the live provider fall back to an empty stub context so the
 * rest of the desktop shell keeps working (HMR / transient crashes).
 */
export function AgentMailProvider({ children }: { children: ReactNode }) {
  return (
    <AgentMailErrorBoundary shell={children}>
      <AgentMailProviderLive>{children}</AgentMailProviderLive>
    </AgentMailErrorBoundary>
  );
}

function AgentMailProviderLive({ children }: { children: ReactNode }) {
  // Deferred chrome channel — must not re-render the whole shell on the same
  // frame as a keep-alive section flip (sync subscribe blocked paint ~500ms+).
  const visible = useSyncExternalStore(
    subscribeWarmKeepAliveChrome,
    getVisibleKeepAliveSurface,
    getVisibleKeepAliveSurface,
  );
  const live = shouldLiveUpdateAgentMail(visible);
  const [liveAfterPaint, setLiveAfterPaint] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!live) {
      setLiveAfterPaint(false);
      return;
    }
    const frame = requestAnimationFrame(() => setLiveAfterPaint(true));
    return () => cancelAnimationFrame(frame);
  }, [live]);

  useEffect(() => {
    if (!liveAfterPaint) return;
    startTransition(() => {
      setEnabled(true);
    });
  }, [liveAfterPaint]);

  const mailState = useAgentMailMailboxes(enabled, {
    liveUpdates: liveAfterPaint,
  });
  const value = useMemo<AgentMailContextValue>(
    () => ({
      ...mailState,
      degraded: false,
    }),
    [mailState],
  );
  return (
    <AgentMailContext.Provider value={value}>
      <MemoizedChildren>{children}</MemoizedChildren>
    </AgentMailContext.Provider>
  );
}

type AgentMailErrorBoundaryProps = {
  children: ReactNode;
  /** App shell to keep mounted under the stub when the live provider throws. */
  shell: ReactNode;
};

type AgentMailErrorBoundaryState = {
  error: Error | null;
  /** Bumps to remount the live provider after a crash. */
  retryKey: number;
  /** Consecutive crash count (resets after a successful live stretch). */
  retries: number;
};

/**
 * Isolates AgentMail render failures from the rest of the desktop tree.
 * On error, remounts the shell under an empty stub (tasks/calendar keep working)
 * and automatically retries the live provider — transient HMR / race crashes
 * should not leave a permanent “AgentMail unavailable” banner.
 */
class AgentMailErrorBoundary extends Component<
  AgentMailErrorBoundaryProps,
  AgentMailErrorBoundaryState
> {
  state: AgentMailErrorBoundaryState = {
    error: null,
    retryKey: 0,
    retries: 0,
  };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<AgentMailErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[desktop] AgentMailProvider failed; stubbing mail and scheduling retry",
      error,
      info.componentStack,
    );
    this.scheduleRetry();
  }

  componentDidUpdate(
    _prevProps: AgentMailErrorBoundaryProps,
    prevState: AgentMailErrorBoundaryState,
  ) {
    // Live tree is healthy again — clear retry streak after a short stable window.
    if (prevState.error && !this.state.error) {
      this.clearStableTimer();
      this.stableTimer = setTimeout(() => {
        this.stableTimer = null;
        if (!this.state.error && this.state.retries > 0) {
          this.setState({ retries: 0 });
        }
      }, 10_000);
    }
  }

  componentWillUnmount() {
    this.clearRetryTimer();
    this.clearStableTimer();
  }

  private clearRetryTimer() {
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private clearStableTimer() {
    if (this.stableTimer != null) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
  }

  private scheduleRetry() {
    this.clearRetryTimer();
    const nextRetries = this.state.retries + 1;
    const delay =
      nextRetries <= AGENTMAIL_FAST_RETRIES
        ? AGENTMAIL_FAST_RETRY_MS
        : AGENTMAIL_SLOW_RETRY_MS;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.setState((current) => ({
        error: null,
        retryKey: current.retryKey + 1,
        retries: nextRetries,
      }));
    }, delay);
  }

  render() {
    if (this.state.error) {
      return (
        <AgentMailContext.Provider value={AGENT_MAIL_CRASH_STUB}>
          {this.props.shell}
        </AgentMailContext.Provider>
      );
    }
    return (
      <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>
    );
  }
}

/**
 * Shared AgentMail list state. When the provider is missing (e.g. HMR context
 * identity reset), returns an empty stub instead of crashing the shell — without
 * the degraded sidebar alert (AgentMail itself is usually fine).
 */
export function useAgentMail(): AgentMailContextValue {
  const value = useContext(AgentMailContext);
  if (!value) {
    if (import.meta.env.DEV && !warnedMissingProvider) {
      warnedMissingProvider = true;
      console.warn(
        "[desktop] useAgentMail used outside AgentMailProvider (or after HMR context reset); using empty stub",
      );
    }
    return AGENT_MAIL_MISSING_STUB;
  }
  return value;
}
