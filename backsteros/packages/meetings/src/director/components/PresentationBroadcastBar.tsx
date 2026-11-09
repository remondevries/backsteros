type PresentationBroadcastButtonProps = {
  isBroadcasting: boolean;
  disabled?: boolean;
  onBroadcast: () => void;
  onStopBroadcast: () => void;
};

/** Compact Broadcast / Stop control for presentation chrome. */
export function PresentationBroadcastButton({
  isBroadcasting,
  disabled = false,
  onBroadcast,
  onStopBroadcast,
}: PresentationBroadcastButtonProps) {
  if (isBroadcasting) {
    return (
      <button
        type="button"
        className="director__presentation-broadcast-btn is-live"
        onClick={onStopBroadcast}
      >
        Stop broadcast
      </button>
    );
  }

  return (
    <button
      type="button"
      className="director__presentation-broadcast-btn is-primary"
      disabled={disabled}
      onClick={onBroadcast}
    >
      Broadcast
    </button>
  );
}
