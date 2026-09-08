import { useEffect } from "react";

import { Button } from "~/components/ui/button";
import { isMacPlatform } from "~/lib/utils";

function isStartWorkingShortcut(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
  );
}

export function BacksterosTaskKickoffStart(props: {
  readonly displayId: string | null;
  readonly title: string;
  readonly busy?: boolean;
  readonly startDisabledReason?: string | null;
  readonly onStartWorking: () => void;
  readonly onAdvanced: () => void;
}) {
  const {
    displayId,
    title,
    busy = false,
    startDisabledReason = null,
    onStartWorking,
    onAdvanced,
  } = props;
  const heading = displayId?.trim()
    ? `${displayId} · ${title.trim() || "Untitled"}`
    : title.trim() || "Untitled task";
  const startDisabled = busy || startDisabledReason != null;
  const startShortcutLabel = isMacPlatform(navigator.platform) ? "⌘↵" : "Ctrl+Enter";

  useEffect(() => {
    if (startDisabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      if (!isStartWorkingShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      onStartWorking();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onStartWorking, startDisabled]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-2 py-2 text-center">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-balance font-medium text-foreground text-xl tracking-tight sm:text-2xl">
          {heading}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          Start the agent on this task, or open advanced to edit the kickoff message first.
        </p>
      </div>
      <div className="flex w-full flex-col items-center gap-2">
        <Button
          type="button"
          size="lg"
          className="w-full max-w-xs"
          disabled={startDisabled}
          title={startDisabledReason ?? `Start working (${startShortcutLabel})`}
          onClick={onStartWorking}
        >
          Start working
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={onAdvanced}
          className="text-muted-foreground text-sm underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
        >
          Advanced
        </button>
        {startDisabledReason ? (
          <p className="text-muted-foreground text-xs">{startDisabledReason}</p>
        ) : null}
      </div>
    </div>
  );
}
