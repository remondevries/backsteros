"use client";

import type { ReactNode } from "react";
import type { DocumentPropertyType } from "@backsteros/contracts";

import { DetailWithPropertiesLayout } from "../content/detail-with-properties-layout.js";
import { DOCUMENT_PROPERTIES_PANEL_WIDTH_KEY } from "../../content/properties-panel.js";
import {
  MarkdownDocumentDetailView,
  type MarkdownDocumentDetailViewProps,
} from "./markdown-document-detail-view.js";
import {
  DocumentPropertiesPanel,
  type DocumentPropertiesPanelModel,
} from "./document-properties-panel.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";

export type DocumentDetailWithPropertiesProps =
  MarkdownDocumentDetailViewProps & {
    documentProperties?: DocumentPropertiesPanelModel;
    propertyTypes?: DocumentPropertyType[];
    contactOptions?: SearchableDropdownOption<string>[];
    taskOptions?: SearchableDropdownOption<string>[];
    extraProperties?: ReactNode;
  };

export function DocumentDetailWithProperties({
  documentProperties,
  propertyTypes,
  contactOptions,
  taskOptions,
  extraProperties,
  ...documentProps
}: DocumentDetailWithPropertiesProps) {
  return (
    <div
      className="help-article-detail-split"
      data-content-detail
      data-detail-split=""
    >
      <DetailWithPropertiesLayout
        storageKey={DOCUMENT_PROPERTIES_PANEL_WIDTH_KEY}
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
                >
                  {extraProperties}
                </DocumentPropertiesPanel>
              ) : (
                extraProperties
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}
