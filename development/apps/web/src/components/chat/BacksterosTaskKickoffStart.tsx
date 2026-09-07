import { Button } from "~/components/ui/button";

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
          title={startDisabledReason ?? undefined}
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
