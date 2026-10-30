"use client";

import {
  createContext,
  forwardRef,
  useContext,
  type MouseEvent,
  type ReactNode,
} from "react";

import { ClientLink, type ClientLinkProps } from "../../shared/client-link.js";

export type ChatCardNavigate = (href: string) => void;

const ChatCardNavigateContext = createContext<ChatCardNavigate | null>(null);

export function ChatCardNavigateProvider({
  navigate,
  children,
}: {
  navigate: ChatCardNavigate | null | undefined;
  children: ReactNode;
}) {
  return (
    <ChatCardNavigateContext.Provider value={navigate ?? null}>
      {children}
    </ChatCardNavigateContext.Provider>
  );
}

export function useChatCardNavigate(): ChatCardNavigate | null {
  return useContext(ChatCardNavigateContext);
}

function isModifiedClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * In-chat entity link. Uses the shell `navigate` callback (same path as the
 * nav / `navigateToHref`) for plain clicks; Cmd/Ctrl-click stays on the
 * anchor so ModClickNewTabListener can open a product tab.
 */
export const ChatCardHref = forwardRef<HTMLAnchorElement, ClientLinkProps>(
  function ChatCardHref(
    { href, className, title, children, onClick, ...rest },
    ref,
  ) {
    const navigate = useChatCardNavigate();
    return (
      <ClientLink
        ref={ref}
        href={href}
        className={className}
        title={title}
        {...rest}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          // Keep the surrounding `<details>` summary from toggling.
          event.stopPropagation();
          if (!navigate || isModifiedClick(event)) return;
          if ("button" in event && event.button !== 0) return;
          event.preventDefault();
          navigate(href);
        }}
      >
        {children}
      </ClientLink>
    );
  },
);
