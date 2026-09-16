"use client";

import type { ReactNode } from "react";

import {
  CONTACT_EXPANDED_WORKSPACE_TABS,
  type ContactExpandedWorkspaceTabId,
  type ContactOverlayLayout,
} from "../../contacts/contact-overlay.js";
import {
  EntityDetailOverlay,
  type EntityDetailOverlayProps,
} from "../shared/entity-detail-overlay.js";

export type ContactDetailOverlayProps = Omit<
  EntityDetailOverlayProps,
  | "entityLabel"
  | "overlayDataKey"
  | "workspaceTabs"
  | "workspaceTab"
  | "onWorkspaceTabChange"
  | "renderWorkspaceTab"
  | "overlayLayout"
> & {
  overlayLayout?: ContactOverlayLayout;
  renderWorkspaceTab?: (
    tab: ContactExpandedWorkspaceTabId,
  ) => ReactNode;
  workspaceTab?: ContactExpandedWorkspaceTabId;
  onWorkspaceTabChange?: (tab: ContactExpandedWorkspaceTabId) => void;
};

/**
 * Right-side contact profile card — shared entity rail + contact workspace tabs.
 */
export function ContactDetailOverlay({
  renderWorkspaceTab,
  workspaceTab,
  onWorkspaceTabChange,
  ...props
}: ContactDetailOverlayProps) {
  return (
    <EntityDetailOverlay
      {...props}
      entityLabel="contact"
      overlayDataKey="contact"
      overlayLayout={props.overlayLayout}
      workspaceTabs={CONTACT_EXPANDED_WORKSPACE_TABS}
      workspaceTab={workspaceTab}
      onWorkspaceTabChange={
        onWorkspaceTabChange
          ? (tabId) =>
              onWorkspaceTabChange(tabId as ContactExpandedWorkspaceTabId)
          : undefined
      }
      renderWorkspaceTab={
        renderWorkspaceTab
          ? (tabId) =>
              renderWorkspaceTab(tabId as ContactExpandedWorkspaceTabId)
          : undefined
      }
    />
  );
}
