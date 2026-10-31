import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import "./shell-chat-panel-loading.css";

const ShellChatPanelLazy = lazy(async () => {
  const mod = await import("./shell-chat-panel");
  return { default: mod.ShellChatPanel };
});

function ShellChatPanelLoading(): ReactNode {
  return (
    <div
      className="shell-chat-panel-loading"
      role="status"
      aria-live="polite"
      aria-label="Loading chat"
    >
      <div className="shell-chat-panel-loading__peers" aria-hidden="true">
        <span className="shell-chat-panel-loading__dot" />
        <span className="shell-chat-panel-loading__dot" />
        <span className="shell-chat-panel-loading__dot" />
      </div>
      <div className="shell-chat-panel-loading__body">
        <p className="shell-chat-panel-loading__label">Loading chat…</p>
        <div className="shell-chat-panel-loading__lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

export type ShellChatPanelSlotProps = {
  /** True while the right chat column is collapsed. */
  collapsed: boolean;
};

/**
 * Lazy-mounts {@link ShellChatPanel} on the first open so the shell entry does
 * not pull the chat / PDF / CodeMirror graph. Once loaded, the panel stays
 * mounted so later toggles are instant.
 */
export function ShellChatPanelSlot({ collapsed }: ShellChatPanelSlotProps) {
  const [everOpened, setEverOpened] = useState(() => !collapsed);

  useEffect(() => {
    if (!collapsed) setEverOpened(true);
  }, [collapsed]);

  if (!everOpened) return null;

  return (
    <Suspense fallback={<ShellChatPanelLoading />}>
      <ShellChatPanelLazy />
    </Suspense>
  );
}
