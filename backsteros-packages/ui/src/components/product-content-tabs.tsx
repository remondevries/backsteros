"use client";

import type { ReactNode } from "react";

import { getNavigationItemIcon } from "./navigation-item-icon.js";
import { SidePanelPlusIcon } from "./side-panel-plus-icon.js";
import {
  resolveTabNavIconId,
  type ProductTab,
} from "../tabs.js";

function isActivateKey(event: { key: string }) {
  return event.key === "Enter" || event.key === " ";
}

export type ProductContentTabsProps = {
  tabs: ProductTab[];
  activeTabId: string;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onOpenNewTab: () => void;
  /** Override default nav-family icons (e.g. document/letter glyphs on web). */
  renderTabIcon?: (tab: ProductTab) => ReactNode;
};

function DefaultTabIcon({ href }: { href: string }) {
  const iconId = resolveTabNavIconId(href);
  const Icon = iconId ? getNavigationItemIcon(iconId) : null;
  if (!Icon) {
    return null;
  }
  return (
    <span className="content-tab-icon" aria-hidden="true">
      <Icon />
    </span>
  );
}

/**
 * Content tabs bar — same look as `backsteros-app` ContentHeader.
 */
export function ProductContentTabs({
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  onOpenNewTab,
  renderTabIcon,
}: ProductContentTabsProps) {
  return (
    <header className="content-tabs-bar" data-tauri-drag-region>
      <div className="content-tabs-scroll">
        <div className="content-tabs-list" role="tablist" aria-label="Open tabs">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const showClose = tabs.length > 1;

            return (
              <span
                key={tab.id}
                role="tab"
                tabIndex={-1}
                aria-selected={isActive}
                className={[
                  "content-tab",
                  isActive ? "content-tab-active" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onActivateTab(tab.id)}
                onKeyDown={(event) => {
                  if (isActivateKey(event)) {
                    event.preventDefault();
                    onActivateTab(tab.id);
                  }
                }}
                title={tab.title}
              >
                <span className="content-tab-content">
                  {renderTabIcon ? (
                    renderTabIcon(tab)
                  ) : (
                    <DefaultTabIcon href={tab.href} />
                  )}
                  <span className="content-tab-label">{tab.title}</span>
                </span>
                {showClose ? (
                  <span className="content-tab-close-fade" aria-hidden="true" />
                ) : null}
                {showClose ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="content-tab-close"
                    aria-label={`Close ${tab.title}`}
                    title={`Close ${tab.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>

        <button
          type="button"
          className="content-tab-add"
          aria-label="Open new tab"
          onClick={onOpenNewTab}
        >
          <SidePanelPlusIcon />
        </button>
      </div>
    </header>
  );
}
