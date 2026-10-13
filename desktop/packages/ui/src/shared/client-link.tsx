"use client";

import {
  createContext,
  forwardRef,
  useContext,
  type AnchorHTMLAttributes,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";

export type ClientLinkProps = {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
} & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "className" | "title" | "children"
>;

export type ClientLinkComponent = ComponentType<
  ClientLinkProps & { ref?: Ref<HTMLAnchorElement> }
>;

const ClientLinkContext = createContext<ClientLinkComponent | null>(null);

export function ClientLinkProvider({
  Link,
  children,
}: {
  Link: ClientLinkComponent;
  children: ReactNode;
}) {
  return (
    <ClientLinkContext.Provider value={Link}>
      {children}
    </ClientLinkContext.Provider>
  );
}

/**
 * In-app link. Uses the host-provided Link (e.g. React Router) when available;
 * falls back to a plain anchor. Forwards refs/props so HoverCard `asChild` works.
 */
export const ClientLink = forwardRef<HTMLAnchorElement, ClientLinkProps>(
  function ClientLink(
    { href, className, title, children, ...rest },
    ref,
  ) {
    const Link = useContext(ClientLinkContext);
    if (Link) {
      return (
        <Link
          href={href}
          className={className}
          title={title}
          ref={ref}
          {...rest}
        >
          {children}
        </Link>
      );
    }

    return (
      <a ref={ref} href={href} className={className} title={title} {...rest}>
        {children}
      </a>
    );
  },
);
