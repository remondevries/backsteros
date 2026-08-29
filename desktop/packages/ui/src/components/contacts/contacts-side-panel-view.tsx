"use client";

import { useState, type ComponentType, type ReactNode } from "react";

import { getContactsGroupHref } from "../../contacts/contact-group-filter.js";
import {
  DEFAULT_CRM_GROUP_COLOR,
  nextCrmGroupPresetColor,
} from "../../crm/crm-group-color.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import { ContentSidePanelList } from "../content/content-side-panel-list.js";
import { CrmGroupColorDot } from "../crm/crm-group-label.js";
import { CrmGroupColorPicker } from "../crm/crm-group-color-picker.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type ContactsSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
}>;

export type ContactsSidePanelGroupItem = {
  id: string;
  name: string;
  color?: string | null;
};

export const CONTACTS_SIDE_PANEL_ALL_ID = "__all__";

export type CreateCrmGroupInput = {
  name: string;
  color: string;
};

export type ContactsSidePanelViewProps = {
  /** Selected CRM group id; `null` means All contacts. */
  selectedGroupId?: string | null;
  groups: ContactsSidePanelGroupItem[];
  Link: ContactsSidePanelLinkComponent;
  onCreateGroup?: (input: CreateCrmGroupInput) => void | Promise<void>;
  highlightedId?: string | null;
};

/**
 * Left content side panel for standalone Contacts — All, then CRM groups,
 * with create below the list (name + color).
 */
export function ContactsSidePanelView({
  selectedGroupId = null,
  groups,
  Link,
  onCreateGroup,
  highlightedId = null,
}: ContactsSidePanelViewProps) {
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState(DEFAULT_CRM_GROUP_COLOR);
  const [creating, setCreating] = useState(false);
  const allActive = selectedGroupId == null;

  function startCreating() {
    setDraftColor(nextCrmGroupPresetColor(groups.length));
    setCreating(true);
  }

  function cancelCreating() {
    setDraftName("");
    setDraftColor(DEFAULT_CRM_GROUP_COLOR);
    setCreating(false);
  }

  function submitCreating() {
    const name = draftName.trim();
    if (!name || !onCreateGroup) return;
    void Promise.resolve(
      onCreateGroup({ name, color: draftColor }),
    ).then(() => {
      setDraftName("");
      setDraftColor(DEFAULT_CRM_GROUP_COLOR);
      setCreating(false);
    });
  }

  return (
    <div className="app-content-side-panel app-content-side-panel--contacts">
      <ContentSidePanelHeader
        title="Groups"
        actions={
          onCreateGroup ? (
            <button
              type="button"
              className="app-side-panel-section-action"
              aria-label="Create group"
              onClick={startCreating}
            >
              <SidePanelPlusIcon />
            </button>
          ) : undefined
        }
      />
      <div className="app-content-side-panel-main">
        <ContentSidePanelList aria-label="Contact groups">
          <li data-keyboard-nav-item={CONTACTS_SIDE_PANEL_ALL_ID}>
            <Link
              to={getContactsGroupHref(null)}
              className={sidePanelItemClass({
                active: allActive,
                keyboardHighlighted: highlightedId === CONTACTS_SIDE_PANEL_ALL_ID,
              })}
              aria-current={allActive ? "page" : undefined}
            >
              <span className="app-side-panel-item-label">All</span>
            </Link>
          </li>
          {groups.map((group) => {
            const isActive = selectedGroupId === group.id;
            return (
              <li key={group.id} data-keyboard-nav-item={group.id}>
                <Link
                  to={getContactsGroupHref(group.id)}
                  className={sidePanelItemClass({
                    active: isActive,
                    keyboardHighlighted: highlightedId === group.id,
                  })}
                  aria-current={isActive ? "page" : undefined}
                >
                  <CrmGroupColorDot color={group.color} size={8} />
                  <span className="app-side-panel-item-label">{group.name}</span>
                </Link>
              </li>
            );
          })}
        </ContentSidePanelList>

        {onCreateGroup ? (
          <div className="contacts-side-panel-create">
            {creating ? (
              <form
                className="contacts-side-panel-create__fields"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitCreating();
                }}
              >
                <input
                  className="app-side-panel-add-folder-input"
                  value={draftName}
                  placeholder="Group name"
                  aria-label="Group name"
                  autoFocus
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelCreating();
                    }
                  }}
                />
                <CrmGroupColorPicker
                  value={draftColor}
                  onChange={setDraftColor}
                />
              </form>
            ) : (
              <button
                type="button"
                className="contacts-side-panel-create__button"
                onClick={startCreating}
              >
                <SidePanelPlusIcon />
                <span>New group</span>
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
