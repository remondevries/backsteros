import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

type ContentSidePanelListProps = {
  children: ReactNode;
  ref?: Ref<HTMLElement>;
} & Omit<ComponentPropsWithoutRef<"nav">, "className" | "children">;

/** Scrollable list region for the left content side panel. */
export function ContentSidePanelList({
  children,
  ref,
  ...navProps
}: ContentSidePanelListProps) {
  return (
    <nav ref={ref} className="app-content-side-panel-body" {...navProps}>
      <ul className="app-content-side-panel-list">{children}</ul>
    </nav>
  );
}

export function ContentSidePanelEmpty({ children }: { children: ReactNode }) {
  return <p className="app-content-side-panel-empty">{children}</p>;
}
