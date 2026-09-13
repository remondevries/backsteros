"use client";

import { DetailWithPropertiesLayout } from "../content/detail-with-properties-layout.js";
import { HELP_ARTICLE_PROPERTIES_PANEL_WIDTH_KEY } from "../../content/properties-panel.js";
import {
  MarkdownDocumentDetailView,
  type MarkdownDocumentDetailViewProps,
} from "../documents/markdown-document-detail-view.js";
import {
  HelpArticlePropertiesDisplay,
  type HelpArticlePropertiesDisplayProps,
} from "./help-article-properties-display.js";
import type { HelpArticleProperties } from "../../spaces/help-article-properties.js";

export type HelpArticleDetailViewProps = MarkdownDocumentDetailViewProps & {
  article: HelpArticleProperties | null;
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
          <MarkdownDocumentDetailView {...documentProps} embedded />
        }
        properties={
          <HelpArticlePropertiesDisplay
            article={article}
            onStatusChange={onStatusChange}
            onContactIdsChange={onContactIdsChange}
            onFolderChange={onFolderChange}
            onCreateFolderFromQuery={onCreateFolderFromQuery}
            onPlacementChange={onPlacementChange}
            onSeoDetailsChange={onSeoDetailsChange}
            showSeoDetails={showSeoDetails}
            slugPrefix={slugPrefix}
            folderId={folderId}
            folderOptions={folderOptions}
            contactOptions={contactOptions}
            placementOptions={placementOptions}
          />
        }
      />
    </div>
  );
}
