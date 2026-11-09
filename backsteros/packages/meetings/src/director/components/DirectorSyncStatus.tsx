import {
  getPresentationDeliveryMode,
  PRESENTATION_LABELS,
  type PresentationKind,
  type PresentationViewportPhase,
} from "../presentation";

type DirectorSyncStatusProps = {
  connected: boolean;
  roomName: string;
  meetingId: string | null;
  selectedPresentation: PresentationKind | null;
  broadcastKind: PresentationKind | null;
  presentationUrl: string | null;
  viewportPhase: PresentationViewportPhase;
};

export function DirectorSyncStatus({
  connected,
  roomName,
  meetingId,
  selectedPresentation,
  broadcastKind,
  presentationUrl,
  viewportPhase,
}: DirectorSyncStatusProps) {
  const isBroadcasting = broadcastKind !== null;
  const mode = getPresentationDeliveryMode(broadcastKind);
  const preparingSwitch =
    isBroadcasting &&
    selectedPresentation !== null &&
    selectedPresentation !== broadcastKind;

  return (
    <details className="director__sync-badge">
      <summary className="director__sync-badge-summary">
        <span
          className={[
            "director__sync-badge-dot",
            isBroadcasting ? "is-live" : connected ? "is-ready" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden
        />
        Guest sync
      </summary>
      <dl className="director__sync-badge-list">
        <div>
          <dt>LiveKit</dt>
          <dd>{connected ? "connected" : "offline"}</dd>
        </div>
        <div>
          <dt>Room</dt>
          <dd>{roomName}</dd>
        </div>
        {meetingId ? (
          <div>
            <dt>Meeting</dt>
            <dd>{meetingId}</dd>
          </div>
        ) : null}
        <div>
          <dt>Prepare</dt>
          <dd>
            {selectedPresentation
              ? PRESENTATION_LABELS[selectedPresentation]
              : "none"}
          </dd>
        </div>
        <div>
          <dt>Broadcast</dt>
          <dd>
            {broadcastKind ? PRESENTATION_LABELS[broadcastKind] : "off"}
          </dd>
        </div>
        {preparingSwitch ? (
          <div>
            <dt>Switch</dt>
            <dd>pending Broadcast</dd>
          </div>
        ) : null}
        {mode ? (
          <div>
            <dt>Delivery</dt>
            <dd>{mode}</dd>
          </div>
        ) : null}
        {broadcastKind === "local" && presentationUrl ? (
          <div>
            <dt>URL</dt>
            <dd className="director__sync-badge-url">{presentationUrl}</dd>
          </div>
        ) : null}
        {mode === "viewport" ? (
          <div>
            <dt>Capture</dt>
            <dd>{viewportPhase}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}
