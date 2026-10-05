"use client";

import { DetailWithPropertiesLayout } from "../content/detail-with-properties-layout.js";
import { HELP_ARTICLE_PROPERTIES_PANEL_WIDTH_KEY } from "../../content/properties-panel.js";
import {
  MarkdownDocumentDetailView,
  type MarkdownDocumentDetailViewProps,
} from "../documents/markdown-document-detail-view.js";
import {
  DocumentPropertiesPanel,
  type DocumentPropertiesPanelModel,
} from "../documents/document-properties-panel.js";
import {
  HelpArticlePropertiesDisplay,
  type HelpArticlePropertiesDisplayProps,
} from "./help-article-properties-display.js";
import type { HelpArticleProperties } from "../../spaces/help-article-properties.js";
import type { DocumentPropertyType } from "@backsteros/contracts";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";

export type HelpArticleDetailViewProps = MarkdownDocumentDetailViewProps & {
  article: HelpArticleProperties | null;
  documentProperties?: DocumentPropertiesPanelModel;
  propertyTypes?: DocumentPropertyType[];
  taskOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onStatusChange?: HelpArticlePropertiesDisplayProps["onStatusChange"];
  onContactIdsChange?: HelpArticlePropertiesDisplayProps["onContactIdsChange"];
  onFolderChange?: HelpArticlePropertiesDisplayProps["onFolderChange"];
  onCreateFolderFromQuery?: HelpArticlePropertiesDisplayProps["onCreateFolderFromQuery"];
  onPlacementChange?: HelpArticlePropertiesDisplayProps["onPlacementChange"];
  onSeoDetailsChange?: HelpArticlePropertiesDisplayProps["onSeoDetailsChange"];
  showSeoDetails?: HelpArticlePropertiesDisplayProps["showSeoDetails"];
  slugPrefix?: HelpArticlePropertiesDisplayProps["slugPrefix"];
  folderId?: HelpArticlePropertiesDisplayProps["folderId"];
  folderOptions?: HelpArticlePropertiesDisplayProps["folderOptions"];
  contactOptions?: HelpArticlePropertiesDisplayProps["contactOptions"];
  placementOptions?: HelpArticlePropertiesDisplayProps["placementOptions"];
};

/**
 * Publishable page detail — markdown editor + properties rail.
 * Used for all Spaces categories; Support alone adds audience-specific fields.
 */
export function HelpArticleDetailView({
  article,
  documentProperties,
  propertyTypes,
  taskOptions,
  projectOptions,
  onStatusChange,
  onContactIdsChange,
  onFolderChange,
  onCreateFolderFromQuery,
  onPlacementChange,
  onSeoDetailsChange,
  showSeoDetails,
  slugPrefix,
  folderId,
  folderOptions,
  contactOptions,
  placementOptions,
  ...documentProps
}: HelpArticleDetailViewProps) {
  return (
    <div
      className="help-article-detail-split"
      data-content-detail
      data-detail-split=""
    >
      <DetailWithPropertiesLayout
        storageKey={HELP_ARTICLE_PROPERTIES_PANEL_WIDTH_KEY}
        main={
          <MarkdownDocumentDetailView
            {...documentProps}
            documentProperties={documentProperties}
            embedded
          />
        }
        properties={
          <div className="task-detail-properties-scroll">
            <div className="entity-properties-stack">
              {documentProperties ? (
                <DocumentPropertiesPanel
                  document={documentProperties}
                  types={propertyTypes}
                  contactOptions={contactOptions}
                  taskOptions={taskOptions}
                  projectOptions={projectOptions}
                >
                  <HelpArticlePropertiesDisplay
                    article={article}
                    sections="fields"
                    onStatusChange={onStatusChange}
                    onContactIdsChange={onContactIdsChange}
                    onFolderChange={onFolderChange}
                    onCreateFolderFromQuery={onCreateFolderFromQuery}
                    onPlacementChange={onPlacementChange}
                    folderId={folderId}
                    folderOptions={folderOptions}
                    contactOptions={contactOptions}
                    placementOptions={placementOptions}
                  />
                </DocumentPropertiesPanel>
              ) : (
                <HelpArticlePropertiesDisplay
                  article={article}
                  onStatusChange={onStatusChange}
                  onContactIdsChange={onContactIdsChange}
                  onFolderChange={onFolderChange}
                  onCreateFolderFromQuery={onCreateFolderFromQuery}
                  onPlacementChange={onPlacementChange}
                  folderId={folderId}
                  folderOptions={folderOptions}
                  contactOptions={contactOptions}
                  placementOptions={placementOptions}
                />
              )}
              {showSeoDetails ? (
                <HelpArticlePropertiesDisplay
                  article={article}
                  sections="seo"
                  showSeoDetails
                  onSeoDetailsChange={onSeoDetailsChange}
                  slugPrefix={slugPrefix}
                />
              ) : null}
            </div>
          </div>
        }
      />
    </div>
  );
}
