"use client";

import { useEffect, useState, type RefObject } from "react";

import { useLatestRef } from "@/hooks/use-latest-ref";
import {
  readStoredPanelWidth,
  RESIZABLE_SIDE_PANEL_LG_MEDIA_QUERY,
} from "@/components/ui/resizable-side-panel";
import { LETTER_PROPERTIES_PANEL_WIDTH_KEY } from "@/lib/letter-properties-panel";

export const LETTER_PDF_PANEL_WIDTH_KEY = "letter-pdf-panel-width";
export const LETTER_PDF_VISIBLE_KEY = "letter-pdf-preview-visible";

const LETTER_PROPERTIES_PANEL_DEFAULT_WIDTH = 300;
const LETTER_PROPERTIES_PANEL_MIN_WIDTH = 240;
const LETTER_PROPERTIES_PANEL_MAX_WIDTH = 480;

const LETTER_PDF_PANEL_DEFAULT_WIDTH = 420;
const LETTER_PDF_PANEL_MIN_WIDTH = 280;
const LETTER_PDF_PANEL_MAX_WIDTH = 99999;

/** Minimum width reserved for the letter body when PDF + properties are both open. */
const LETTER_DETAIL_MIN_CONTENT_WIDTH = 240;

type UseLetterPdfLayoutCollapseOptions = {
  layoutRef: RefObject<HTMLElement | null>;
  propertiesPanelRef: RefObject<HTMLElement | null>;
  pdfPanelRef: RefObject<HTMLElement | null>;
  pdfOpen: boolean;
};

function resolveNominalPdfPanelWidth(layoutWidth: number): number {
  const storedWidth = readStoredPanelWidth(
    LETTER_PDF_PANEL_WIDTH_KEY,
    LETTER_PDF_PANEL_DEFAULT_WIDTH,
    LETTER_PDF_PANEL_MIN_WIDTH,
    LETTER_PDF_PANEL_MAX_WIDTH,
  );

  return Math.min(storedWidth, layoutWidth * 0.9);
}

function resolveNominalPropertiesPanelWidth(): number {
  return readStoredPanelWidth(
    LETTER_PROPERTIES_PANEL_WIDTH_KEY,
    LETTER_PROPERTIES_PANEL_DEFAULT_WIDTH,
    LETTER_PROPERTIES_PANEL_MIN_WIDTH,
    LETTER_PROPERTIES_PANEL_MAX_WIDTH,
  );
}

export function useLetterPdfLayoutCollapse({
  layoutRef,
  propertiesPanelRef,
  pdfPanelRef,
  pdfOpen,
}: UseLetterPdfLayoutCollapseOptions) {
  const [showCompanionPanels, setShowCompanionPanels] = useState(true);
  const showCompanionPanelsRef = useLatestRef(showCompanionPanels);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) {
      return;
    }

    const mediaQuery = window.matchMedia(RESIZABLE_SIDE_PANEL_LG_MEDIA_QUERY);
    const observedElements = new Set<HTMLElement>();

    function syncObservedElements(observer: ResizeObserver) {
      const targets: HTMLElement[] = [];

      if (layout) {
        targets.push(layout);
      }

      if (pdfPanelRef.current) {
        targets.push(pdfPanelRef.current);
      }

      if (propertiesPanelRef.current) {
        targets.push(propertiesPanelRef.current);
      }

      for (const element of targets) {
        if (!observedElements.has(element)) {
          observer.observe(element);
          observedElements.add(element);
        }
      }
    }

    function evaluate() {
      if (!layout) {
        return;
      }

      if (!pdfOpen || !mediaQuery.matches) {
        setShowCompanionPanels(true);
        return;
      }

      const layoutWidth = layout.clientWidth;
      const pdfWidth = resolveNominalPdfPanelWidth(layoutWidth);
      const propertiesWidth = resolveNominalPropertiesPanelWidth();
      const contentWidth = layoutWidth - pdfWidth - propertiesWidth;
      const nextShow = contentWidth >= LETTER_DETAIL_MIN_CONTENT_WIDTH;
      const prevShow = showCompanionPanelsRef.current;

      if (nextShow !== prevShow) {
        setShowCompanionPanels(nextShow);
      }
    }

    const observer = new ResizeObserver(() => {
      syncObservedElements(observer);
      evaluate();
    });

    syncObservedElements(observer);
    evaluate();

    mediaQuery.addEventListener("change", evaluate);
    window.addEventListener("storage", evaluate);

    return () => {
      observer.disconnect();
      observedElements.clear();
      mediaQuery.removeEventListener("change", evaluate);
      window.removeEventListener("storage", evaluate);
    };
  }, [
    layoutRef,
    pdfOpen,
    pdfPanelRef,
    propertiesPanelRef,
    showCompanionPanelsRef,
  ]);

  return {
    showPropertiesPanel: showCompanionPanels,
    showContentArea: showCompanionPanels,
  };
}
