"use client";

import type { ReactNode } from "react";

import {
  ResizableSidePanel,
  type ResizableSidePanelProps,
} from "./resizable-side-panel.js";

export type DetailWithPropertiesLayoutProps = {
  main: ReactNode;
  properties: ReactNode;
  dock?: ReactNode;
  storageKey: string;
  legacyStorageKeys?: string[];
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  panelClassName?: string;
  edge?: ResizableSidePanelProps["edge"];
};

/**
 * Main content column + right properties rail (task/letter detail pattern).
 */
export function DetailWithPropertiesLayout({
  main,
  properties,
  dock,
  storageKey,
  legacyStorageKeys,
  defaultWidth = 300,
  minWidth = 240,
  maxWidth = 480,
  panelClassName,
  edge = "start",
}: DetailWithPropertiesLayoutProps) {
  return (
    <div className="detail-with-properties">
      <div className="detail-with-properties__main">{main}</div>
      <ResizableSidePanel
        storageKey={storageKey}
        legacyStorageKeys={legacyStorageKeys}
        defaultWidth={defaultWidth}
        minWidth={minWidth}
        maxWidth={maxWidth}
        edge={edge}
        className={`detail-properties-panel${
          panelClassName ? ` ${panelClassName}` : ""
        }`}
      >
        <div className="detail-properties-panel__inner">
          {properties}
          {dock}
        </div>
      </ResizableSidePanel>
    </div>
  );
}
