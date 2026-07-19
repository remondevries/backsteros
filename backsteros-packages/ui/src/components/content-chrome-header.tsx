"use client";

import type { ComponentType, ReactNode } from "react";

export type ContentBreadcrumbItem = {
  label: string;
  href?: string;
};

export type ContentBreadcrumbLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

export type ContentBreadcrumbProps = {
  items: ContentBreadcrumbItem[];
  Link?: ComponentType<ContentBreadcrumbLinkProps>;
  className?: string;
};

/**
 * Compact crumb trail for the content chrome header (web NavigationBreadcrumb parity).
 */
export function ContentBreadcrumb({
  items,
  Link,
  className = "",
}: ContentBreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`content-breadcrumb ${className}`.trim()}
    >
      <ol className="content-breadcrumb__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="content-breadcrumb__item">
              {index > 0 ? (
                <span className="content-breadcrumb__sep" aria-hidden="true">
                  ›
                </span>
              ) : null}
              {item.href && !isLast && Link ? (
                <Link to={item.href} className="content-breadcrumb__link">
                  {item.label}
                </Link>
              ) : item.href && !isLast ? (
                <a href={item.href} className="content-breadcrumb__link">
                  {item.label}
                </a>
              ) : (
                <span
                  className={`content-breadcrumb__current${
                    isLast ? " content-breadcrumb__current--page" : ""
                  }`}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type ContentChromeHeaderProps = {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Fixed-height chrome row above page-scroll (web ContentChromeHeader). */
export function ContentChromeHeader({
  children,
  actions,
  className = "",
}: ContentChromeHeaderProps) {
  return (
    <div
      className={`content-chrome-header app-breadcrumb-header ${className}`.trim()}
    >
      <div className="content-chrome-header__main">{children}</div>
      {actions ? (
        <div className="content-chrome-header__actions">{actions}</div>
      ) : null}
    </div>
  );
}
