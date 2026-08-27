import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getInboxAttentionGroupKey, type InboxListItem } from "@backsteros/ui";

import type { InboxSessionPin } from "./build-inbox-session-list";

type InboxListSessionContextValue = {
  pinnedItems: Map<string, InboxSessionPin>;
  pinInboxListItem: (item: InboxListItem) => void;
  unpinInboxListItem: (itemId: string) => void;
};

const InboxListSessionContext = createContext<InboxListSessionContextValue | null>(
  null,
);

export function useInboxListSessionPin(): InboxListSessionContextValue {
  const value = useContext(InboxListSessionContext);
  if (!value) {
    throw new Error("useInboxListSessionPin requires InboxListSessionProvider");
  }
  return value;
}

export function useInboxListSessionState(inInboxPanel: boolean): {
  pinnedItems: Map<string, InboxSessionPin>;
  pinInboxListItem: (item: InboxListItem) => void;
  unpinInboxListItem: (itemId: string) => void;
  sessionContextValue: InboxListSessionContextValue;
} {
  const [pinnedItems, setPinnedItems] = useState<Map<string, InboxSessionPin>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!inInboxPanel) {
      setPinnedItems(new Map());
    }
  }, [inInboxPanel]);

  const pinInboxListItem = useCallback((item: InboxListItem) => {
    if (item.kind === "letter") return;
    setPinnedItems((current) => {
      const next = new Map(current);
      next.set(item.id, {
        item: { ...item, inboxUpdatedAt: null },
        attentionGroup: getInboxAttentionGroupKey(item),
      });
      return next;
    });
  }, []);

  const unpinInboxListItem = useCallback((itemId: string) => {
    setPinnedItems((current) => {
      if (!current.has(itemId)) return current;
      const next = new Map(current);
      next.delete(itemId);
      return next;
    });
  }, []);

  const sessionContextValue = useMemo(
    () => ({ pinnedItems, pinInboxListItem, unpinInboxListItem }),
    [pinInboxListItem, pinnedItems, unpinInboxListItem],
  );

  return { pinnedItems, pinInboxListItem, unpinInboxListItem, sessionContextValue };
}

export function InboxListSessionProvider({
  value,
  children,
}: {
  value: InboxListSessionContextValue;
  children: ReactNode;
}) {
  return (
    <InboxListSessionContext.Provider value={value}>
      {children}
    </InboxListSessionContext.Provider>
  );
}
