"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChatUiAttachmentsCardData, ChatUiCardPart } from "@backsteros/contracts";
import { chatUiAttachmentsCardDataSchema } from "@backsteros/contracts";

export type ChatAttachmentOpenPdfFn = (
  url: string,
  filename: string,
) => void | Promise<void>;

export type ChatAttachmentResolveUrlFn = (
  url: string,
) => Promise<string>;

export type ChatAttachmentRenderPdfThumbFn = (
  resolvedUrl: string,
  filename: string,
) => ReactNode;

type ChatAttachmentActions = {
  openPdf: ChatAttachmentOpenPdfFn | null;
  resolveUrl: ChatAttachmentResolveUrlFn | null;
  renderPdfThumb: ChatAttachmentRenderPdfThumbFn | null;
};

const ChatAttachmentActionsContext = createContext<ChatAttachmentActions>({
  openPdf: null,
  resolveUrl: null,
  renderPdfThumb: null,
});

export function ChatAttachmentActionsProvider({
  openPdf = null,
  resolveUrl = null,
  renderPdfThumb = null,
  children,
}: {
  openPdf?: ChatAttachmentOpenPdfFn | null;
  resolveUrl?: ChatAttachmentResolveUrlFn | null;
  renderPdfThumb?: ChatAttachmentRenderPdfThumbFn | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ openPdf, resolveUrl, renderPdfThumb }),
    [openPdf, resolveUrl, renderPdfThumb],
  );
  return (
    <ChatAttachmentActionsContext.Provider value={value}>
      {children}
    </ChatAttachmentActionsContext.Provider>
  );
}

function parseAttachmentsData(
  part: ChatUiCardPart,
): ChatUiAttachmentsCardData | null {
  const parsed = chatUiAttachmentsCardDataSchema.safeParse(part.data ?? {});
  return parsed.success ? parsed.data : null;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10_240 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10_485_760 ? 1 : 0)} MB`;
}

function mimeShort(mime: string, kind: string): string {
  if (kind === "pdf") return "PDF";
  if (kind === "image") {
    const sub = mime.split("/")[1]?.toUpperCase();
    return sub || "Image";
  }
  const sub = mime.split("/")[1]?.toUpperCase();
  if (sub && sub !== "OCTET-STREAM") return sub;
  return "File";
}

function FileGlyph({ kind }: { kind: string }) {
  const label = kind === "pdf" ? "PDF" : kind === "image" ? "IMG" : "FILE";
  return (
    <span className="chat-ui-file-card__glyph" aria-hidden>
      {label}
    </span>
  );
}

function useResolvedUrl(url: string): string | null {
  const { resolveUrl } = useContext(ChatAttachmentActionsContext);
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      if (!resolveUrl) {
        setResolved(url);
        return;
      }
      try {
        const next = await resolveUrl(url);
        if (cancelled) return;
        if (next.startsWith("blob:")) objectUrl = next;
        setResolved(next);
      } catch {
        if (!cancelled) setResolved(url);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resolveUrl, url]);

  return resolved;
}

function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="chat-ui-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="chat-ui-image-lightbox__img"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

function AttachmentItem({
  item,
}: {
  item: ChatUiAttachmentsCardData["items"][number];
}) {
  const { openPdf, renderPdfThumb } = useContext(ChatAttachmentActionsContext);
  const resolved = useResolvedUrl(item.url);
  const [lightbox, setLightbox] = useState(false);

  const openOther = useCallback(() => {
    if (!resolved) return;
    const anchor = document.createElement("a");
    anchor.href = resolved;
    anchor.download = item.filename;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
  }, [item.filename, resolved]);

  if (item.kind === "image") {
    return (
      <>
        <button
          type="button"
          className="chat-ui-file-card is-image"
          onClick={() => resolved && setLightbox(true)}
          disabled={!resolved}
        >
          {resolved ? (
            <img
              src={resolved}
              alt={item.filename}
              className="chat-ui-file-card__thumb"
            />
          ) : (
            <FileGlyph kind="image" />
          )}
          <span className="chat-ui-file-card__meta">
            <span className="chat-ui-file-card__name">{item.filename}</span>
            <span className="chat-ui-file-card__sub">
              {formatBytes(item.size)} · {mimeShort(item.mime, item.kind)}
            </span>
          </span>
        </button>
        {lightbox && resolved ? (
          <ImageLightbox
            src={resolved}
            alt={item.filename}
            onClose={() => setLightbox(false)}
          />
        ) : null}
      </>
    );
  }

  if (item.kind === "pdf") {
    return (
      <button
        type="button"
        className="chat-ui-file-card is-pdf"
        onClick={() => {
          if (!resolved || !openPdf) {
            openOther();
            return;
          }
          void openPdf(resolved, item.filename);
        }}
        disabled={!resolved}
      >
        <span className="chat-ui-file-card__preview">
          {resolved && renderPdfThumb
            ? renderPdfThumb(resolved, item.filename)
            : (
              <FileGlyph kind="pdf" />
            )}
        </span>
        <span className="chat-ui-file-card__meta">
          <span className="chat-ui-file-card__name">{item.filename}</span>
          <span className="chat-ui-file-card__sub">
            {formatBytes(item.size)} · PDF
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="chat-ui-file-card is-file"
      onClick={openOther}
      disabled={!resolved}
    >
      <FileGlyph kind="file" />
      <span className="chat-ui-file-card__meta">
        <span className="chat-ui-file-card__name">{item.filename}</span>
        <span className="chat-ui-file-card__sub">
          {formatBytes(item.size)} · {mimeShort(item.mime, item.kind)}
        </span>
      </span>
    </button>
  );
}

export function ChatAttachmentsCard({ part }: { part: ChatUiCardPart }) {
  const data = useMemo(() => parseAttachmentsData(part), [part]);
  if (!data) return null;
  return (
    <div className="chat-ui-attachments" role="list">
      {data.items.map((item) => (
        <div key={item.id} className="chat-ui-attachments__item" role="listitem">
          <AttachmentItem item={item} />
        </div>
      ))}
    </div>
  );
}

export function findAttachmentsCardPart(
  parts: readonly { type: string; cardType?: string }[],
): ChatUiCardPart | null {
  for (const part of parts) {
    if (part.type === "card" && part.cardType === "attachments") {
      return part as ChatUiCardPart;
    }
  }
  return null;
}
