import type { ManualChunksOption } from "rollup";

/**
 * Vendor chunk map for desktop production builds.
 * Keeps heavy deps out of the main shell chunk so cold-start parse stays smaller.
 */
export const desktopManualChunks: ManualChunksOption = (id) => {
  if (!id.includes("node_modules")) return;

  if (
    id.includes("@powersync/") ||
    id.includes("@journeyapps/wa-sqlite") ||
    id.includes("wa-sqlite")
  ) {
    return "vendor-powersync";
  }
  if (id.includes("lexical") || id.includes("@lexical/")) {
    return "vendor-lexical";
  }
  if (id.includes("@codemirror/")) {
    return "vendor-codemirror";
  }
  if (id.includes("pdfjs") || id.includes("react-pdf")) {
    return "vendor-pdfjs";
  }
  if (id.includes("@xterm/")) {
    return "vendor-xterm";
  }
  if (id.includes("@fullcalendar/")) {
    return "vendor-fullcalendar";
  }
  if (id.includes("@nivo/")) {
    return "vendor-nivo";
  }
};
