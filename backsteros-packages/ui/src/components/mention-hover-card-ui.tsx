import type { ReactNode } from "react";

export function MentionHoverCardSeparator() {
  return <div className="mention-hover-card__separator" aria-hidden="true" />;
}

export function MentionHoverMetaRow({ children }: { children: ReactNode }) {
  return <div className="mention-hover-card__meta">{children}</div>;
}

export function MentionHoverTitle({ children }: { children: ReactNode }) {
  return <p className="mention-hover-card__title">{children}</p>;
}

export function MentionHoverFooterRow({ children }: { children: ReactNode }) {
  return <div className="mention-hover-card__footer">{children}</div>;
}

export function MentionHoverPanel({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "structured";
}) {
  return (
    <div
      className={
        variant === "structured"
          ? "mention-hover-card__panel mention-hover-card__panel--structured"
          : "mention-hover-card__panel"
      }
    >
      {children}
    </div>
  );
}

export function MentionHoverHeader({
  icon,
  title,
}: {
  icon: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="mention-hover-card__header">
      {icon}
      <span className="mention-hover-card__header-title">{title}</span>
    </div>
  );
}

export function MentionHoverSection({ children }: { children: ReactNode }) {
  return <div className="mention-hover-card__section">{children}</div>;
}

export function MentionHoverDescription({
  children,
  clamp = 3,
  mono = false,
}: {
  children: ReactNode;
  clamp?: 2 | 3;
  mono?: boolean;
}) {
  return (
    <p
      className={[
        "mention-hover-card__description",
        clamp === 2
          ? "mention-hover-card__description--clamp-2"
          : "mention-hover-card__description--clamp-3",
        mono ? "mention-hover-card__description--mono" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </p>
  );
}

export function MentionHoverStatusRow({ children }: { children: ReactNode }) {
  return <div className="mention-hover-card__status">{children}</div>;
}

export function MentionHoverInline({ children }: { children: ReactNode }) {
  return <span className="mention-hover-card__inline">{children}</span>;
}
