import Link from "next/link";
import { Fragment, type ReactNode } from "react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
  node?: ReactNode;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
  className?: string;
  onNavigate?: (href: string) => void;
};

export function Breadcrumb({
  items,
  className = "",
  onNavigate,
}: BreadcrumbProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className={`min-w-0 ${className}`.trim()}>
      <ol className="flex min-w-0 items-center gap-1.5 text-xs leading-none text-foreground/50">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 ? (
                <li aria-hidden="true" className="shrink-0 text-foreground/30">
                  ›
                </li>
              ) : null}
              <li className="min-w-0">
                {item.node ? (
                  item.node
                ) : item.href && !isLast ? (
                  <Link
                    href={item.href}
                    onClick={() => onNavigate?.(item.href!)}
                    className="block truncate transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={`block truncate ${
                      isLast ? "font-medium text-foreground/75" : ""
                    }`}
                    aria-current={isLast ? "page" : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
