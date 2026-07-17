"use client";

import { useTabs } from "@/components/shell/tabs-provider";
import { TabIcon } from "@/components/shell/tab-icon";
import { SidePanelPlusIcon } from "@/components/shell/side-panel-plus-icon";
import { isListKeyboardActivateKey } from "@/lib/shortcuts/should-handle-list-keyboard-navigation";

export function ContentHeader() {
  const { tabs, activeTabId, activateTab, closeTab, openNewTab } = useTabs();

  return (
    <header className="content-tabs-bar">
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
                onClick={() => activateTab(tab.id)}
                onKeyDown={(event) => {
                  if (isListKeyboardActivateKey(event)) {
                    event.preventDefault();
                    activateTab(tab.id);
                  }
                }}
                title={tab.title}
              >
                <span className="content-tab-content">
                  <TabIcon href={tab.href} icon={tab.icon} />
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
                      closeTab(tab.id);
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
          onClick={openNewTab}
        >
          <SidePanelPlusIcon />
        </button>
      </div>
    </header>
  );
}
