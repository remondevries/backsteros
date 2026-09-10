import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { contentCrossfadeStyle, useContentCrossfade } from "./useContentCrossfade";

/**
 * Fades opacity out/in when `contentKey` changes. Renders `children(displayedKey)`
 * where `displayedKey` lags until mid-fade so the outgoing section stays visible.
 */
export function BacksterosContentCrossfade(props: {
  readonly contentKey: string;
  readonly className?: string | undefined;
  readonly children: (displayedKey: string) => ReactNode;
}) {
  const crossfade = useContentCrossfade(props.contentKey);

  return (
    <div
      className={cn("min-h-0 min-w-0", props.className)}
      style={contentCrossfadeStyle(crossfade)}
      data-content-crossfade={crossfade.faded ? "out" : "in"}
      data-content-crossfade-key={crossfade.displayedKey}
    >
      {props.children(crossfade.displayedKey)}
    </div>
  );
}
