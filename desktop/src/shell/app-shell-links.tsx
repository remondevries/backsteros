import {
  forwardRef,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Link, NavLink } from "react-router-dom";

import { type ClientLinkProps } from "@backsteros/ui";

export function RouterLink({
  to,
  className,
  children,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onFocus,
  onPointerDown,
  title,
  ...rest
}: {
  to: string;
  className?: string;
  children?: ReactNode;
  onClick?: (event?: MouseEvent<HTMLAnchorElement>) => void;
  onDoubleClick?: (event: MouseEvent) => void;
  onMouseEnter?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLAnchorElement>) => void;
  title?: string;
  "aria-current"?: "page";
  "aria-label"?: string;
  [key: string]: unknown;
}) {
  return (
    <NavLink
      to={to}
      className={className}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      title={title}
      aria-current={rest["aria-current"] as "page" | undefined}
      {...rest}
    >
      {children as never}
    </NavLink>
  );
}

export const DesktopClientLink = forwardRef<HTMLAnchorElement, ClientLinkProps>(
  function DesktopClientLink(
    { href, className, title, children, ...rest },
    ref,
  ) {
    // Duplicate @types/react in the monorepo (Expo 19.0 vs desktop 19.1+) makes
    // React Router's Link props incompatible with AnchorHTMLAttributes — cast.
    return (
      <Link
        ref={ref}
        to={href}
        className={className}
        title={title}
        {...(rest as object)}
      >
        {children as never}
      </Link>
    );
  },
);
