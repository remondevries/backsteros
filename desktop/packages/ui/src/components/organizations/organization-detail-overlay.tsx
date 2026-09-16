"use client";

import type { ReactNode } from "react";

import {
  ORGANIZATION_EXPANDED_WORKSPACE_TABS,
  type OrganizationExpandedWorkspaceTabId,
  type OrganizationOverlayLayout,
} from "../../organizations/organization-overlay.js";
import {
  EntityDetailOverlay,
  type EntityDetailOverlayProps,
} from "../shared/entity-detail-overlay.js";

export type OrganizationDetailOverlayProps = Omit<
  EntityDetailOverlayProps,
  | "entityLabel"
  | "overlayDataKey"
  | "workspaceTabs"
  | "workspaceTab"
  | "onWorkspaceTabChange"
  | "renderWorkspaceTab"
  | "overlayLayout"
> & {
  overlayLayout?: OrganizationOverlayLayout;
  renderWorkspaceTab?: (
    tab: OrganizationExpandedWorkspaceTabId,
  ) => ReactNode;
  workspaceTab?: OrganizationExpandedWorkspaceTabId;
  onWorkspaceTabChange?: (tab: OrganizationExpandedWorkspaceTabId) => void;
  workspaceTabs?: readonly {
    id: OrganizationExpandedWorkspaceTabId;
    label: string;
  }[];
};

/**
 * Right-side organization profile card — shared entity rail + org workspace tabs.
 */
export function OrganizationDetailOverlay({
  renderWorkspaceTab,
  workspaceTab,
  onWorkspaceTabChange,
  workspaceTabs = ORGANIZATION_EXPANDED_WORKSPACE_TABS,
  ...props
}: OrganizationDetailOverlayProps) {
  return (
    <EntityDetailOverlay
      {...props}
      entityLabel="organization"
      overlayDataKey="organization"
      overlayLayout={props.overlayLayout}
      workspaceTabs={workspaceTabs}
      workspaceTab={workspaceTab}
      onWorkspaceTabChange={
        onWorkspaceTabChange
          ? (tabId) =>
              onWorkspaceTabChange(
                tabId as OrganizationExpandedWorkspaceTabId,
              )
          : undefined
      }
      renderWorkspaceTab={
        renderWorkspaceTab
          ? (tabId) =>
              renderWorkspaceTab(
                tabId as OrganizationExpandedWorkspaceTabId,
              )
          : undefined
      }
    />
  );
}
