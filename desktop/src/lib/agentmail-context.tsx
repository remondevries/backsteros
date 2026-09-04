import {
  Component,
  createContext,
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
import type { EmailListItem, EmailMailbox } from "@backsteros/ui";

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
  loading: boolean;
  messagesLoading: boolean;
  reload: () => Promise<void>;
  /**
   * True when the live provider is missing or crashed and consumers are on the
   * empty stub. Sidebar shows a red alert while this is set.
   */
  degraded: boolean;
};

/** Empty mail state so the shell stays up when the provider is missing or crashed. */
const AGENT_MAIL_STUB: AgentMailContextValue = {
  mailboxes: [],
  messages: [],
  apiKeyConfigured: false,
  loading: false,
  messagesLoading: false,
  reload: async () => {},
  degraded: true,
};

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
};

/**
 * Isolates AgentMail render failures from the rest of the desktop tree.
 * On error, remounts the shell under an empty stub context (email UI degrades;
 * tasks/calendar/etc. keep working).
 */
class AgentMailErrorBoundary extends Component<
  AgentMailErrorBoundaryProps,
  AgentMailErrorBoundaryState
> {
  state: AgentMailErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AgentMailErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[desktop] AgentMailProvider failed; continuing with empty mail stub",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <AgentMailContext.Provider value={AGENT_MAIL_STUB}>
          {this.props.shell}
        </AgentMailContext.Provider>
      );
    }
    return this.props.children;
  }
}

/**
 * Shared AgentMail list state. When the provider is missing (e.g. HMR context
 * identity reset), returns an empty stub instead of crashing the shell.
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
    return AGENT_MAIL_STUB;
  }
  return value;
}
