import type { LetterAttachment } from "@backsteros/contracts";
import {
  LETTER_PDF_VISIBLE_KEY,
  useLetterPdfAttachmentShortcuts,
  useLetterPdfMaximizeShortcut,
  useLetterPdfToggleShortcut,
} from "@backsteros/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDesktopApi } from "./api-context";
import {
  fetchLetterAttachments,
  peekLetterAttachmentCache,
  writeLetterAttachmentCache,
} from "./letter-attachment-cache";
import { pickAndUploadLetterPdf } from "./letter-pdf-upload";

function readStoredPdfOpen(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(LETTER_PDF_VISIBLE_KEY);
  if (stored === "0") return false;
  if (stored === "1") return true;
  return true;
}

export function useLetterPdfPanel(
  letterId: string | null | undefined,
  options: {
    hasLegacyPdf: boolean;
    legacyFilename?: string | null;
    /** When false, skip shortcut registration (compose / missing letter). */
    enabled?: boolean;
  },
) {
  const { client } = useDesktopApi();
  const { hasLegacyPdf, legacyFilename, enabled = true } = options;
  const shortcutsEnabled = Boolean(enabled && letterId);

  const cachedAttachments = letterId
    ? peekLetterAttachmentCache(letterId)
    : null;
  const [attachments, setAttachments] = useState<LetterAttachment[]>(
    cachedAttachments ?? [],
  );
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<
    string | null
  >(null);
  const [pdfOpen, setPdfOpen] = useState(readStoredPdfOpen);
  const [pdfMaximized, setPdfMaximized] = useState(false);
  const [revision, setRevision] = useState(0);
  const [uploading, setUploading] = useState(false);
  const pendingAttachmentIdRef = useRef<string | null>(null);
  const [activeLetterId, setActiveLetterId] = useState(letterId);

  // Seed attachment list from session cache on letter switch (Next SWR feel).
  if (letterId !== activeLetterId) {
    setActiveLetterId(letterId);
    setPdfMaximized(false);
    pendingAttachmentIdRef.current = null;
    if (!letterId) {
      setAttachments([]);
      setSelectedAttachmentId(null);
    } else {
      const next = peekLetterAttachmentCache(letterId);
      // Never show another letter's attachment ids under the new letterId.
      setAttachments(next ?? []);
      setSelectedAttachmentId(null);
    }
  }

  const reloadAttachments = useCallback(async () => {
    if (!letterId) {
      setAttachments([]);
      return;
    }
    try {
      const next = await fetchLetterAttachments(client, letterId);
      setAttachments(next);
    } catch (error) {
      console.error("[desktop] list letter attachments", error);
      if (!peekLetterAttachmentCache(letterId)) {
        setAttachments([]);
      }
    }
  }, [client, letterId]);

  useEffect(() => {
    void reloadAttachments();
  }, [reloadAttachments, revision]);

  useEffect(() => {
    if (attachments.length === 0) {
      setSelectedAttachmentId(null);
      return;
    }
    const pending = pendingAttachmentIdRef.current;
    if (pending && attachments.some((entry) => entry.id === pending)) {
      pendingAttachmentIdRef.current = null;
      setSelectedAttachmentId(pending);
      return;
    }
    setSelectedAttachmentId((current) => {
      if (current && attachments.some((entry) => entry.id === current)) {
        return current;
      }
      return attachments[0]?.id ?? null;
    });
  }, [attachments]);

  const hasPdf = attachments.length > 0 || hasLegacyPdf;

  useEffect(() => {
    if (!hasPdf) {
      setPdfMaximized(false);
    }
  }, [hasPdf]);

  const openPdfPanel = useCallback(() => {
    setPdfOpen(true);
    window.localStorage.setItem(LETTER_PDF_VISIBLE_KEY, "1");
  }, []);

  const togglePdfOpen = useCallback(() => {
    setPdfOpen((current) => {
      const next = !current;
      if (!next) {
        setPdfMaximized(false);
      }
      window.localStorage.setItem(LETTER_PDF_VISIBLE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const togglePdfMaximized = useCallback(() => {
    setPdfMaximized((current) => {
      const next = !current;
      if (next) {
        setPdfOpen(true);
        window.localStorage.setItem(LETTER_PDF_VISIBLE_KEY, "1");
      }
      return next;
    });
  }, []);

  const selectAttachment = useCallback(
    (attachmentId: string) => {
      const nextId = attachmentId || null;
      pendingAttachmentIdRef.current = nextId;
      setSelectedAttachmentId(nextId);
      openPdfPanel();
    },
    [openPdfPanel],
  );

  const attachmentIds = useMemo(
    () => attachments.map((attachment) => attachment.id),
    [attachments],
  );

  useLetterPdfToggleShortcut(togglePdfOpen, { enabled: shortcutsEnabled });
  useLetterPdfMaximizeShortcut(togglePdfMaximized, {
    enabled: shortcutsEnabled,
  });
  useLetterPdfAttachmentShortcuts({
    attachmentIds,
    hasLegacyPdf,
    onSelect: selectAttachment,
    enabled: shortcutsEnabled,
  });

  useEffect(() => {
    if (!pdfMaximized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPdfMaximized(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pdfMaximized]);

  const uploadPdf = useCallback(async () => {
    if (!letterId) return;
    setUploading(true);
    try {
      const result = await pickAndUploadLetterPdf(client, letterId);
      if (!result.ok) {
        console.error("[desktop] letter pdf upload", result.error);
        return;
      }
      if (result.attachmentId) {
        pendingAttachmentIdRef.current = result.attachmentId;
        setSelectedAttachmentId(result.attachmentId);
      } else {
        pendingAttachmentIdRef.current = null;
        setSelectedAttachmentId(null);
      }
      openPdfPanel();
      setRevision((value) => value + 1);
    } finally {
      setUploading(false);
    }
  }, [client, letterId, openPdfPanel]);

  const renameAttachment = useCallback(
    async (attachmentId: string, originalFilename: string) => {
      if (!letterId) {
        return { ok: false as const, error: "Letter is required." };
      }
      try {
        await client.updateLetterAttachment(letterId, attachmentId, {
          originalFilename,
        });
        setRevision((value) => value + 1);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error ? error.message : "Could not rename PDF.",
        };
      }
    },
    [client, letterId],
  );

  const deleteAttachment = useCallback(
    async (attachmentId: string) => {
      if (!letterId) {
        return { ok: false as const, error: "Letter is required." };
      }
      try {
        await client.deleteLetterAttachment(letterId, attachmentId);
        const remaining = attachments.filter(
          (entry) => entry.id !== attachmentId,
        );
        const nextSelected =
          selectedAttachmentId === attachmentId
            ? (remaining[0]?.id ?? null)
            : selectedAttachmentId;
        pendingAttachmentIdRef.current = nextSelected;
        setSelectedAttachmentId(nextSelected);
        setAttachments(remaining);
        writeLetterAttachmentCache(letterId, remaining);
        setRevision((value) => value + 1);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error ? error.message : "Could not delete PDF.",
        };
      }
    },
    [attachments, client, letterId, selectedAttachmentId],
  );

  return {
    attachments,
    selectedAttachmentId,
    pdfOpen,
    pdfMaximized,
    hasPdf,
    uploading,
    revision,
    legacyFilename: legacyFilename ?? "Document.pdf",
    selectAttachment,
    togglePdfOpen,
    togglePdfMaximized,
    uploadPdf,
    renameAttachment,
    deleteAttachment,
    reloadAttachments: () => setRevision((value) => value + 1),
  };
}
