import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { usePresentationFloatChrome } from "../hooks/use-presentation-float-chrome";
import { usePresentationUrlHistory } from "../hooks/use-presentation-url-history";
import {
  normalizePresentationUrl,
  presentationUrlForDisplay,
} from "../presentation-url";
import type { PresentationKind } from "../presentation";
import { PRESENTATION_LABELS } from "../presentation";
import { PresentationBrowserChrome } from "./PresentationBrowserChrome";
import { PresentationBroadcastButton } from "./PresentationBroadcastBar";

type PresentationIframeSurfaceProps = {
  kind: PresentationKind;
  url: string | null;
  onUrlChange: (url: string | null) => void;
  isBroadcasting: boolean;
  onBroadcast: () => void;
  onStopBroadcast: () => void;
  swapClass: string;
};

export function PresentationIframeSurface({
  kind,
  url,
  onUrlChange,
  isBroadcasting,
  onBroadcast,
  onStopBroadcast,
  swapClass,
}: PresentationIframeSurfaceProps) {
  const [draft, setDraft] = useState(presentationUrlForDisplay(url));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { visible, reveal, chromeProps } = usePresentationFloatChrome();
  const {
    pushUrl,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    reset,
  } = usePresentationUrlHistory(onUrlChange);

  useEffect(() => {
    setDraft(presentationUrlForDisplay(url));
  }, [url]);

  useEffect(() => {
    return () => reset();
  }, [reset]);

  const commitDraft = useCallback(() => {
    const normalized = normalizePresentationUrl(draft);
    if (!normalized) {
      pushUrl(null);
      return;
    }
    pushUrl(normalized);
    setDraft(normalized);
  }, [draft, pushUrl]);

  const onSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      commitDraft();
    },
    [commitDraft],
  );

  const reload = useCallback(() => {
    if (!url || !iframeRef.current) return;
    iframeRef.current.src = url;
  }, [url]);

  return (
    <div
      className={[
        "director__presentation-pane",
        "director__presentation-pane--iframe",
        "director__presentation-pane--overlay",
        isBroadcasting ? "is-broadcasting" : null,
        swapClass,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="director__presentation-iframe-wrap">
        {url ? (
          <iframe
            ref={iframeRef}
            className="director__presentation-iframe"
            src={url}
            title={`${PRESENTATION_LABELS[kind]} presentation`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        ) : (
          <div className="director__presentation-iframe-empty">
            <p className="director__presentation-title">Enter a URL</p>
            <p className="director__presentation-copy">
              Load your deck here first. Guests only see it after you press{" "}
              <strong>Broadcast</strong>.
            </p>
            <p className="director__presentation-copy director__presentation-copy--muted">
              Guests only get the URL (not your scroll or clicks). Sites that
              forbid embedding show a blank page — use{" "}
              <strong>Screenshare</strong> when you need to walk a page live.
            </p>
          </div>
        )}
        {url ? (
          <p className="director__presentation-iframe-hint">
            Blank or scroll not syncing? Local only shares the URL — use
            Screenshare to show what you see.
          </p>
        ) : null}
      </div>

      <div
        className="director__presentation-float-hit"
        aria-hidden
        onPointerEnter={reveal}
        onPointerMove={reveal}
      />

      <div
        className={[
          "director__presentation-float-layer",
          visible ? "is-visible" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        {...chromeProps}
      >
        <PresentationBrowserChrome
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={onSubmit}
          onReload={reload}
          canReload={Boolean(url)}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onBack={goBack}
          onForward={goForward}
          placeholder="https://your-deck.example.com/slide/1"
          extraActions={
            <PresentationBroadcastButton
              isBroadcasting={isBroadcasting}
              disabled={!url}
              onBroadcast={onBroadcast}
              onStopBroadcast={onStopBroadcast}
            />
          }
        />
      </div>
    </div>
  );
}
