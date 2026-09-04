import { ApiClientError } from "@backsteros/api-client";
import type { TaskAttachment } from "@backsteros/contracts";
import { useCallback, useEffect, useState } from "react";

import { useDesktopApi } from "./api-context";

/** PowerSync may show a task before `/powersync/write` lands it on the API. */
const ATTACHMENT_LIST_NOT_FOUND_RETRIES = 5;
const ATTACHMENT_LIST_NOT_FOUND_BASE_MS = 250;

async function uploadTaskFile(
  client: ReturnType<typeof useDesktopApi>["client"],
  taskId: string,
  file: File,
): Promise<{ ok: true; attachment: TaskAttachment } | { ok: false; error: string }> {
  try {
    const attachment = await client.uploadTaskAttachment(
      taskId,
      file,
      file.name.trim() || "attachment.bin",
    );
    return { ok: true, attachment };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not upload file.";
    return { ok: false, error: message };
  }
}

function isPdfAttachment(attachment: TaskAttachment): boolean {
  const type = attachment.contentType?.toLowerCase() ?? "";
  const name = attachment.originalFilename?.toLowerCase() ?? "";
  return type === "application/pdf" || name.endsWith(".pdf");
}

function safeDownloadFilename(name: string): string {
  const trimmed = name.trim() || "attachment";
  return trimmed.replace(/[/\\?%*:|"<>]/g, "_");
}

async function openPdfWithSystemViewer(
  blob: Blob,
  filename: string,
): Promise<boolean> {
  try {
    const { BaseDirectory, mkdir, writeFile } = await import(
      "@tauri-apps/plugin-fs"
    );
    const { openPath } = await import("@tauri-apps/plugin-opener");
    const safeName = safeDownloadFilename(
      filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`,
    );
    await mkdir(".config/backsteros/tmp", {
      baseDir: BaseDirectory.Home,
      recursive: true,
    });
    const relativePath = `.config/backsteros/tmp/${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(relativePath, bytes, { baseDir: BaseDirectory.Home });
    const { homeDir, join } = await import("@tauri-apps/api/path");
    const absolute = await join(await homeDir(), relativePath);
    await openPath(absolute);
    return true;
  } catch {
    return false;
  }
}

/** Open a PDF in Preview / a new WebView tab. */
async function openPdfBlobInNewTab(
  blob: Blob,
  filename: string,
): Promise<void> {
  if (await openPdfWithSystemViewer(blob, filename)) {
    return;
  }
  const pdfBlob =
    blob.type === "application/pdf"
      ? blob
      : new Blob([blob], { type: "application/pdf" });
  const url = URL.createObjectURL(pdfBlob);
  // Avoid `noopener` — it often yields a blank tab for blob: PDF URLs in WKWebView.
  const opened = window.open(url, "_blank");
  if (!opened) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeDownloadFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function useTaskFileAttachments(
  taskId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const { client } = useDesktopApi();
  const enabled = options.enabled ?? true;
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState(taskId);

  if (taskId !== activeTaskId) {
    setActiveTaskId(taskId);
    setAttachments([]);
    setError(null);
  }

  const reload = useCallback(async () => {
    if (!taskId || !enabled) {
      setAttachments([]);
      return;
    }
    try {
      const body = await client.listTaskAttachments(taskId);
      setAttachments(body.attachments);
      setError(null);
    } catch (err) {
      setAttachments([]);
      // Task not on API yet (local-first create) — empty until retry/sync.
      if (err instanceof ApiClientError && err.status === 404) {
        return;
      }
      console.error("[desktop] list task attachments", err);
    }
  }, [client, enabled, taskId]);

  useEffect(() => {
    if (!enabled || !taskId) {
      setAttachments([]);
      return;
    }
    let cancelled = false;
    let attempt = 0;
    let retryTimer: number | undefined;

    const load = async () => {
      try {
        const body = await client.listTaskAttachments(taskId);
        if (cancelled) return;
        setAttachments(body.attachments);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setAttachments([]);
        if (err instanceof ApiClientError && err.status === 404) {
          if (attempt < ATTACHMENT_LIST_NOT_FOUND_RETRIES) {
            const delay = Math.min(
              ATTACHMENT_LIST_NOT_FOUND_BASE_MS * 2 ** attempt,
              2000,
            );
            attempt += 1;
            retryTimer = window.setTimeout(() => {
              void load();
            }, delay);
          }
          return;
        }
        console.error("[desktop] list task attachments", err);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [client, enabled, taskId]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!taskId) {
        throw new Error("No task selected.");
      }
      setUploading(true);
      setError(null);
      try {
        const result = await uploadTaskFile(client, taskId, file);
        if (!result.ok) {
          setError(result.error);
          throw new Error(result.error);
        }
        setAttachments((current) => [...current, result.attachment]);
        return result.attachment;
      } finally {
        setUploading(false);
      }
    },
    [client, taskId],
  );

  const remove = useCallback(
    async (attachmentId: string) => {
      if (!taskId) return;
      try {
        await client.deleteTaskAttachment(taskId, attachmentId);
        setAttachments((current) =>
          current.filter((entry) => entry.id !== attachmentId),
        );
        setError(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not delete attachment.";
        setError(message);
      }
    },
    [client, taskId],
  );

  const open = useCallback(
    async (attachmentId: string) => {
      if (!taskId) return;
      const meta = attachments.find((entry) => entry.id === attachmentId);
      try {
        const blob = await client.downloadTaskAttachment(taskId, attachmentId);
        if (meta && isPdfAttachment(meta)) {
          await openPdfBlobInNewTab(
            blob,
            meta.originalFilename?.trim() || "attachment.pdf",
          );
          return;
        }
        // Images and other types: still try a new tab when previewable.
        const type = (meta?.contentType ?? blob.type).toLowerCase();
        if (type.startsWith("image/")) {
          const url = URL.createObjectURL(
            blob.type.startsWith("image/")
              ? blob
              : new Blob([blob], { type: type || "application/octet-stream" }),
          );
          window.open(url, "_blank");
          window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
          return;
        }
        downloadBlob(
          blob,
          meta?.originalFilename?.trim() || "attachment",
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not open attachment.";
        setError(message);
      }
    },
    [attachments, client, taskId],
  );

  return {
    attachments,
    uploading,
    error,
    reload,
    uploadFile,
    remove,
    open,
  };
}
