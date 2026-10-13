import { useEffect, useRef } from "react";

/**
 * Clear the inbox "updated" flag after the user leaves the open item.
 * Inbox uses {@link useAcknowledgeInboxUpdateOnView} instead.
 */
export function useAcknowledgeInboxUpdateOnLeave({
  itemKey,
  hasUpdateFlag,
  onAcknowledge,
}: {
  itemKey: string | null | undefined;
  hasUpdateFlag: boolean;
  onAcknowledge: (itemKey: string) => void;
}): void {
  const onAckRef = useRef(onAcknowledge);
  onAckRef.current = onAcknowledge;

  useEffect(() => {
    if (!itemKey || !hasUpdateFlag) return;
    const key = itemKey;
    return () => {
      onAckRef.current(key);
    };
  }, [itemKey, hasUpdateFlag]);
}
