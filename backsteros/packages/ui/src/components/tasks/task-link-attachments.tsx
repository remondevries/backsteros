"use client";

import { PencilIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  coercePenpotDesignUrl,
  isBacksterDesignUri,
  parsePenpotDesignLink,
  resolvePenpotDesignOpenUrl,
  type TaskLink,
} from "@backsteros/contracts";

const DESIGN_DESKTOP_CHANNEL = "backsterdesign-desktop";

import {
  ADD_TASK_LINK_SHORTCUT_HINT,
  shouldHandleAddTaskLinkShortcut,
} from "../../tasks/task-link-add-shortcut.js";
import { isInternalAppHref } from "../../navigation/is-internal-app-href.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import { BacksterDesignLogoIcon } from "../icons/backster-design-logo-icon.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { LetterIcon } from "../letters/letter-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { FileTypeIcon } from "../documents/file-type-icon.js";
import { formatLetterDisplayId, parseLetterSlug } from "../../letters/letters.js";
import { PdfFileIcon } from "./pdf-file-icon.js";

const MAX_TASK_LINKS = 20;
const MAX_TASK_LINK_URL_LENGTH = 2000;

export type TaskLinkAttachmentKind = "url" | "document" | "email" | "file";

export type TaskLinkPickerOption = {
  id: string;
  label: string;
  href: string;
  detail?: string | null;
  /** e.g. Document / Letter — shown above the title in picker results. */
  kindLabel?: string | null;
  /** e.g. Spaces / BacksterOS (Desktop) — ownership scope. */
  scopeLabel?: string | null;
};

export type TaskFileAttachmentItem = {
  id: string;
  originalFilename: string;
  byteSize: number;
};

export type TaskLinkAttachmentsProps = {
  links?: TaskLink[] | null;
  onChangeLinks?: (links: TaskLink[]) => void;
  readOnly?: boolean;
  /** Documents available to attach (filtered client-side by search). */
  documentOptions?: readonly TaskLinkPickerOption[];
  /**
   * Letters available to attach. Shown inside the Document tab search
   * alongside documents (with kind/scope labels).
   */
  letterOptions?: readonly TaskLinkPickerOption[];
  /** Emails available to attach (filtered client-side by search). */
  emailOptions?: readonly TaskLinkPickerOption[];
  /** Prefer app navigation for internal hrefs. */
  onNavigate?: (href: string) => void;
  /**
   * Public Penpot / BacksterDESIGN origin used to resolve
   * `backsterdesign://…` links (default `https://localhost:3449`).
   * Pass `window.location.origin` when rendering inside Penpot.
   */
  designPublicUri?: string;
  /** File attachments (blob uploads; shown in the same list). */
  fileAttachments?: readonly TaskFileAttachmentItem[];
  fileUploading?: boolean;
  onUploadFile?: (file: File) => void | Promise<void>;
  onRemoveFile?: (attachmentId: string) => void;
  onOpenFile?: (attachmentId: string) => void;
};

/**
 * Hash-only path for same-origin Penpot URLs (`#/workspace?…`).
 * Penpot's router listens to hash changes; absolute https hrefs are
 * intercepted and do nothing inside the SPA.
 */
export function penpotHashHref(href: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    if (!url.hash.startsWith("#/")) return null;
    return url.hash;
  } catch {
    return null;
  }
}

function isBacksterDesignDesktopShell(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  if (document.documentElement.getAttribute("data-tauri-desktop") === "1") {
    return true;
  }
  const win = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  if (win.__TAURI__ != null || win.__TAURI_INTERNALS__ != null) {
    return true;
  }
  return window.location.search.includes("tauri-desktop=1");
}

/**
 * Ask the Tauri shell / Penpot desktop bridge to open a file (adds a chrome
 * tab via `tab-upsert` after `go-to-workspace`).
 */
function openDesignLinkInDesktopShell(href: string): boolean {
  if (!isBacksterDesignDesktopShell()) return false;
  const parsed = parsePenpotDesignLink(href);
  if (!parsed?.fileId) return false;

  const message: Record<string, string> = {
    channel: DESIGN_DESKTOP_CHANNEL,
    type: "open-file",
    fileId: parsed.fileId,
  };
  if (parsed.pageId) message.pageId = parsed.pageId;
  if (parsed.teamId) message.teamId = parsed.teamId;
  if (parsed.boardId) message.boardId = parsed.boardId;

  window.postMessage(message, "*");

  // Always ask for an explicit board reveal as well. When the file is already
  // open, open-file navigation can be a no-op — retry a few times so select+zoom
  // still lands after pan / page settle.
  if (parsed.boardId) {
    for (const ms of [0, 75, 200, 400]) {
      window.setTimeout(() => requestBoardReveal(href), ms);
    }
  }

  // Optimistic tab strip update (report-route also emits tab-upsert).
  const tabUpsert = {
    channel: DESIGN_DESKTOP_CHANNEL,
    type: "tab-upsert" as const,
    fileId: parsed.fileId,
    name: "Untitled",
    ...(parsed.pageId ? { pageId: parsed.pageId } : {}),
    ...(parsed.teamId ? { teamId: parsed.teamId } : {}),
    ...(parsed.boardId ? { boardId: parsed.boardId } : {}),
  };
  const tauri = (window as Window & {
    __TAURI__?: { event?: { emit?: (name: string, payload: unknown) => Promise<unknown> } };
  }).__TAURI__;
  void tauri?.event?.emit?.("bd-from-spa", tabUpsert)?.catch?.(() => undefined);

  return true;
}

/**
 * Open a resolved task-link href. In the Tauri Design shell, routes through
 * the desktop bridge so the chrome tab strip updates. Same-origin browser
 * Penpot uses the hash router; cross-origin opens a new tab.
 */
function requestBoardReveal(href: string): void {
  const parsed = parsePenpotDesignLink(href);
  if (!parsed?.boardId || typeof window === "undefined") return;
  window.postMessage(
    {
      channel: DESIGN_DESKTOP_CHANNEL,
      type: "reveal-board",
      boardId: parsed.boardId,
      ...(parsed.pageId ? { pageId: parsed.pageId } : {}),
      ...(parsed.fileId ? { fileId: parsed.fileId } : {}),
    },
    "*",
  );
}

export function openTaskLinkHref(href: string): void {
  if (typeof window === "undefined" || !href.trim()) return;

  if (openDesignLinkInDesktopShell(href)) {
    return;
  }

  const hash = penpotHashHref(href);
  if (hash) {
    // Prefer hash update so goog.History / reitit pick it up without a reload.
    if (window.location.hash === hash) {
      // Force a re-navigation when linking to the already-open file.
      window.location.hash = "";
      window.location.hash = hash;
      requestBoardReveal(href);
      return;
    }
    window.location.hash = hash;
    requestBoardReveal(href);
    return;
  }

  let absolute = href.trim();
  try {
    absolute = new URL(absolute, window.location.href).href;
  } catch {
    // keep absolute as trimmed href
  }

  // Do not pass a features string — WKWebView / some browsers treat
  // "noopener,noreferrer" as window features and return null.
  const opened = window.open(absolute, "_blank");
  if (opened) return;

  const anchor = document.createElement("a");
  anchor.href = absolute;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Coerce pasted / stored Spark deep links into a canonical `readdle-spark://…`
 * form. Also recovers URLs that were wrongly prefixed with https://.
 */
export function coerceSparkEmailUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_TASK_LINK_URL_LENGTH) {
    return null;
  }

  // https://readdle-spark//bl=…  (https prepend + URL parser collapse)
  const httpsCollapsed = trimmed.match(
    /^https?:\/\/readdle-spark\/+(.*)$/i,
  );
  if (httpsCollapsed) {
    return `readdle-spark://${httpsCollapsed[1]}`;
  }

  // https://readdle-spark://bl=… (https prepend before collapse)
  const httpsWrapped = trimmed.match(/^https?:\/\/(readdle-spark:\/.*)$/i);
  if (httpsWrapped) {
    return httpsWrapped[1].replace(/^readdle-spark:\/(?!\/)/i, "readdle-spark://");
  }

  if (/^readdle-spark:/i.test(trimmed)) {
    return trimmed.replace(/^readdle-spark:\/?\/?/i, "readdle-spark://");
  }

  return null;
}

export function normalizeTaskLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_TASK_LINK_URL_LENGTH) {
    return null;
  }

  // In-app paths (email, documents, tasks).
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  const spark = coerceSparkEmailUrl(trimmed);
  if (spark) {
    try {
      const url = new URL(spark);
      if (url.protocol.toLowerCase() !== "readdle-spark:") {
        return null;
      }
      return spark;
    } catch {
      return null;
    }
  }

  // Penpot / BacksterDESIGN workspace → backsterdesign://workspace?…
  const design = coercePenpotDesignUrl(trimmed);
  if (design) {
    return design;
  }

  // Don't prepend https:// to other custom schemes (mailto:, etc.).
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function isGithubTaskLinkUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "github.com" || host.endsWith(".github.com");
  } catch {
    return false;
  }
}

export function isSparkEmailTaskLinkUrl(url: string): boolean {
  return coerceSparkEmailUrl(url) != null;
}

export function isAppEmailTaskLinkUrl(url: string): boolean {
  return /^\/email\//i.test(url.trim());
}

export function isAppDocumentTaskLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    /^\/spaces\//i.test(trimmed) ||
    /^\/knowledge\//i.test(trimmed) ||
    /\/documents\//i.test(trimmed)
  );
}

/** True for in-app letter detail hrefs (`/letters/l-N` or scoped `…/letters/l-N`). */
export function isAppLetterTaskLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  const match = trimmed.match(/(?:^|\/)letters(?:-v2)?\/([^/?#]+)/i);
  if (!match?.[1]) {
    return false;
  }
  return parseLetterSlug(match[1]) != null;
}

function letterNumberFromTaskLinkUrl(url: string): number | null {
  const match = url.trim().match(/(?:^|\/)letters(?:-v2)?\/([^/?#]+)/i);
  if (!match?.[1]) {
    return null;
  }
  return parseLetterSlug(match[1]);
}

export function isPenpotDesignTaskLinkUrl(url: string): boolean {
  return (
    isBacksterDesignUri(url) || coercePenpotDesignUrl(url) != null
  );
}

/** True when the design link targets a board/frame (not file-only). */
export function isPenpotDesignBoardTaskLinkUrl(url: string): boolean {
  const parsed = parsePenpotDesignLink(url);
  return Boolean(parsed?.boardId);
}

function PenpotDesignBoardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8.85 6.15 12 3l3.15 3.15L12 9.3zm5.85 6.3 3.15-3.15L21 12.45l-3.15 3.15zm-5.85 5.4L12 14.7l3.15 3.15L12 21zM3 12l3.15-3.15L9.3 12l-3.15 3.15z" />
    </svg>
  );
}

/** Href used when opening a task link (resolves design URIs to https). */
export function resolveTaskLinkOpenHref(
  url: string,
  designPublicUri = "https://localhost:3449",
): string {
  if (isBacksterDesignUri(url) || coercePenpotDesignUrl(url)) {
    return (
      resolvePenpotDesignOpenUrl(url, designPublicUri) ??
      url
    );
  }
  return coerceSparkEmailUrl(url) ?? url;
}

export function taskLinkDisplayLabel(url: string): string {
  if (isSparkEmailTaskLinkUrl(url) || isAppEmailTaskLinkUrl(url)) {
    return "E-mail";
  }
  if (isPenpotDesignBoardTaskLinkUrl(url)) {
    return "Item";
  }
  if (isPenpotDesignTaskLinkUrl(url)) {
    return "File";
  }
  if (isAppLetterTaskLinkUrl(url)) {
    const number = letterNumberFromTaskLinkUrl(url);
    return number != null ? formatLetterDisplayId(number) : "Letter";
  }
  if (isAppDocumentTaskLinkUrl(url)) {
    try {
      const parts = url.split("/").filter(Boolean);
      const last = parts[parts.length - 1] ?? "Document";
      return decodeURIComponent(last);
    } catch {
      return "Document";
    }
  }
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * Prefer a readable label when picker options are available.
 * Letters: `L-12 - Title`. Documents: title only (no path).
 * Falls back to {@link taskLinkDisplayLabel} for URLs and unresolved links.
 */
export function resolveTaskLinkAttachmentLabel(
  url: string,
  options: readonly TaskLinkPickerOption[] = [],
): string {
  const match = options.find((option) => option.href === url);
  if (!match?.label?.trim()) {
    return taskLinkDisplayLabel(url);
  }

  const title = match.label.trim();
  if (isAppLetterTaskLinkUrl(url) || match.kindLabel === "Letter") {
    const id =
      match.detail?.trim() ||
      (letterNumberFromTaskLinkUrl(url) != null
        ? formatLetterDisplayId(letterNumberFromTaskLinkUrl(url)!)
        : null);
    return id ? `${id} - ${title}` : title;
  }

  if (isAppDocumentTaskLinkUrl(url) || match.kindLabel === "Document") {
    return title;
  }

  return title;
}

function formatFileBytes(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function createTaskLinkId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `link_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function TaskLinkFavicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return <ProjectOcticon icon="link" size={16} />;
  }

  if (failed || !host) {
    return <ProjectOcticon icon="link" size={16} />;
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
      alt=""
      width={16}
      height={16}
      className="task-link-attachments__favicon"
      onError={() => setFailed(true)}
    />
  );
}

function TaskLinkAttachmentLabel({
  url,
  label,
}: {
  url: string;
  label: string;
}): ReactNode {
  if (!isPenpotDesignTaskLinkUrl(url)) {
    return label;
  }
  return (
    <>
      <span className="task-link-attachments__product">BacksterDESIGN</span>
      <span className="task-link-attachments__label-text">{label}</span>
    </>
  );
}

export function TaskLinkIcon({ url }: { url: string }): ReactNode {
  if (isSparkEmailTaskLinkUrl(url) || isAppEmailTaskLinkUrl(url)) {
    return <EmailNavIcon size={16} />;
  }
  if (isPenpotDesignBoardTaskLinkUrl(url)) {
    return <PenpotDesignBoardIcon size={16} />;
  }
  if (isPenpotDesignTaskLinkUrl(url)) {
    return <BacksterDesignLogoIcon size={16} />;
  }
  if (isAppLetterTaskLinkUrl(url)) {
    return <LetterIcon size={16} />;
  }
  if (isAppDocumentTaskLinkUrl(url)) {
    return <ProjectOcticon icon="file" size={16} />;
  }
  if (isGithubTaskLinkUrl(url)) {
    return <ProjectOcticon icon="mark-github" size={16} />;
  }
  return <TaskLinkFavicon url={url} />;
}

function PaperclipIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={13}
      height={13}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"
      />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 12"
      width={12}
      height={12}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M2.22 2.22a.749.749 0 0 1 1.06 0L6 4.939 8.72 2.22a.749.749 0 1 1 1.06 1.06L7.061 6 9.78 8.72a.749.749 0 1 1-1.06 1.06L6 7.061 3.28 9.78a.749.749 0 1 1-1.06-1.06L4.939 6 2.22 3.28a.749.749 0 0 1 0-1.06Z"
      />
    </svg>
  );
}

export function TaskLinkAttachments({
  links,
  onChangeLinks,
  readOnly = false,
  documentOptions = [],
  letterOptions = [],
  emailOptions = [],
  onNavigate,
  designPublicUri = "https://localhost:3449",
  fileAttachments = [],
  fileUploading = false,
  onUploadFile,
  onRemoveFile,
  onOpenFile,
}: TaskLinkAttachmentsProps) {
  const remoteLinks = links ?? [];
  const remoteKey = JSON.stringify(remoteLinks);
  const [items, setItems] = useState(remoteLinks);
  const [itemsSourceKey, setItemsSourceKey] = useState(remoteKey);
  if (remoteKey !== itemsSourceKey) {
    const priorSourceKey = itemsSourceKey;
    setItemsSourceKey(remoteKey);
    if (JSON.stringify(items) === priorSourceKey) {
      setItems(remoteLinks);
    }
  }

  const canUploadFiles = Boolean(onUploadFile) && !readOnly;
  const canEditLinks = Boolean(onChangeLinks) && !readOnly;
  const canEdit = canEditLinks || canUploadFiles;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [attachKind, setAttachKind] = useState<TaskLinkAttachmentKind>("url");
  const [draftUrl, setDraftUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const openModal = useCallback(() => {
    setEditingLinkId(null);
    setDraftUrl("");
    setSearchQuery("");
    setAttachKind(canEditLinks ? "url" : "file");
    setFormError(null);
    setModalOpen(true);
  }, [canEditLinks]);

  const openEditModal = useCallback((linkId: string, url: string) => {
    setEditingLinkId(linkId);
    setDraftUrl(url);
    setSearchQuery("");
    setAttachKind("url");
    setFormError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingLinkId(null);
    setDraftUrl("");
    setSearchQuery("");
    setFormError(null);
  }, []);

  const portalTarget =
    typeof document !== "undefined"
      ? (rootRef.current?.closest(".bos-product-shell") ?? document.body)
      : null;

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    function handleAddLinkShortcut(event: KeyboardEvent) {
      if (
        !shouldHandleAddTaskLinkShortcut(event, {
          enabled: canEdit,
          modalAlreadyOpen: modalOpen,
          root: rootRef.current,
        })
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      openModal();
    }

    window.addEventListener("keydown", handleAddLinkShortcut, true);
    return () => {
      window.removeEventListener("keydown", handleAddLinkShortcut, true);
    };
  }, [canEdit, modalOpen, openModal]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (attachKind === "file") {
        fileInputRef.current?.focus();
        return;
      }
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [attachKind, closeModal, modalOpen]);

  function appendLink(url: string) {
    if (!onChangeLinks) {
      return;
    }
    if (items.length >= MAX_TASK_LINKS) {
      setFormError(`You can attach up to ${MAX_TASK_LINKS} links.`);
      return;
    }
    const normalized = normalizeTaskLinkUrl(url);
    if (!normalized) {
      setFormError("Enter a valid URL.");
      return;
    }
    if (items.some((item) => item.url === normalized)) {
      setFormError("This link is already attached.");
      return;
    }
    const next = [
      ...items,
      {
        id: createTaskLinkId(),
        url: normalized,
        createdAt: new Date().toISOString(),
      },
    ];
    setItems(next);
    onChangeLinks(next);
    closeModal();
  }

  function updateLink(linkId: string, url: string) {
    if (!onChangeLinks) {
      return;
    }
    const normalized = normalizeTaskLinkUrl(url);
    if (!normalized) {
      setFormError("Enter a valid URL.");
      return;
    }
    if (items.some((item) => item.id !== linkId && item.url === normalized)) {
      setFormError("This link is already attached.");
      return;
    }
    const next = items.map((item) =>
      item.id === linkId ? { ...item, url: normalized } : item,
    );
    setItems(next);
    onChangeLinks(next);
    closeModal();
  }

  function handleRemove(id: string) {
    if (!onChangeLinks) {
      return;
    }
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    onChangeLinks(next);
  }

  function handleSave(event?: FormEvent) {
    event?.preventDefault();
    if (attachKind !== "url") return;
    if (editingLinkId) {
      updateLink(editingLinkId, draftUrl);
      return;
    }
    appendLink(draftUrl);
  }

  async function handleFileSelected(file: File | null) {
    if (!file || !onUploadFile) return;
    setFormError(null);
    setFileBusy(true);
    try {
      await onUploadFile(file);
      closeModal();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not upload file.",
      );
    } finally {
      setFileBusy(false);
    }
  }

  const query = searchQuery.trim().toLowerCase();
  function filterPickerOptions(options: readonly TaskLinkPickerOption[]) {
    return options
      .filter((option) => {
        if (!query) return true;
        return (
          option.label.toLowerCase().includes(query) ||
          (option.detail?.toLowerCase().includes(query) ?? false) ||
          (option.kindLabel?.toLowerCase().includes(query) ?? false) ||
          (option.scopeLabel?.toLowerCase().includes(query) ?? false)
        );
      })
      .slice(0, 40);
  }
  const filteredDocuments = filterPickerOptions([
    ...documentOptions,
    ...letterOptions,
  ]);
  const filteredEmails = filterPickerOptions(emailOptions);

  const kindOptions = [
    ...(canEditLinks
      ? ([
          { value: "url" as const, label: "URL" },
          { value: "document" as const, label: "Document" },
          { value: "email" as const, label: "E-mail" },
        ] as const)
      : []),
    ...(canUploadFiles
      ? ([{ value: "file" as const, label: "File" }] as const)
      : []),
  ];

  const addShortcutTitle = `Add attachment (${ADD_TASK_LINK_SHORTCUT_HINT})`;
  const uploading = fileBusy || fileUploading;
  const hasRows = items.length > 0 || fileAttachments.length > 0;
  const linkLabelOptions = [
    ...documentOptions,
    ...letterOptions,
    ...emailOptions,
  ];

  return (
    <div
      ref={rootRef}
      className="task-detail-attachments task-link-attachments"
    >
      {canEdit ? (
        <div className="task-link-attachments__toolbar">
          <button
            type="button"
            className="task-link-attachments__add"
            aria-label={addShortcutTitle}
            title={addShortcutTitle}
            onClick={openModal}
          >
            <PaperclipIcon />
            {!hasRows ? (
              <span className="task-link-attachments__add-label">
                Add attachment
              </span>
            ) : null}
          </button>
        </div>
      ) : null}

      {hasRows ? (
        <ul className="task-link-attachments__list">
          {items.map((item) => {
            const href = resolveTaskLinkOpenHref(item.url, designPublicUri);
            const internal = isInternalAppHref(href);
            const designLink = isPenpotDesignTaskLinkUrl(item.url);
            const hashHref = designLink ? penpotHashHref(href) : null;
            const anchorHref = hashHref ?? href;
            // Design links must not use onNavigate (BacksterOS would
            // client-route an absolute Penpot URL). Open via openTaskLinkHref.
            const openViaHandler = Boolean(onNavigate) && internal && !designLink;
            const displayLabel = resolveTaskLinkAttachmentLabel(
              item.url,
              linkLabelOptions,
            );
            return (
            <li key={item.id} className="task-link-attachments__row">
              {openViaHandler ? (
                <button
                  type="button"
                  className="task-link-attachments__link task-link-attachments__link--button"
                  title={href}
                  onClick={() => onNavigate?.(href)}
                >
                  <span
                    className="task-link-attachments__icon"
                    aria-hidden="true"
                  >
                    <TaskLinkIcon url={href} />
                  </span>
                  <span className="task-link-attachments__label">
                    <TaskLinkAttachmentLabel url={item.url} label={displayLabel} />
                  </span>
                </button>
              ) : (
                <a
                  className="task-link-attachments__link"
                  href={anchorHref}
                  target={designLink || internal ? undefined : "_blank"}
                  rel={designLink || internal ? undefined : "noreferrer"}
                  title={href}
                  onClick={(event) => {
                    if (designLink) {
                      event.preventDefault();
                      event.stopPropagation();
                      openTaskLinkHref(href);
                      return;
                    }
                    if (!internal || !onNavigate) return;
                    event.preventDefault();
                    onNavigate(href);
                  }}
                >
                  <span
                    className="task-link-attachments__icon"
                    aria-hidden="true"
                  >
                    <TaskLinkIcon url={href} />
                  </span>
                  <span className="task-link-attachments__label">
                    <TaskLinkAttachmentLabel url={item.url} label={displayLabel} />
                  </span>
                </a>
              )}
              {canEditLinks ? (
                <div className="task-link-attachments__actions">
                  <button
                    type="button"
                    className="task-link-attachments__action"
                    aria-label="Edit link"
                    title="Edit link"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openEditModal(item.id, item.url);
                    }}
                  >
                    <PencilIcon size={12} />
                  </button>
                  <button
                    type="button"
                    className="task-link-attachments__action"
                    aria-label="Remove link"
                    title="Remove link"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleRemove(item.id);
                    }}
                  >
                    <RemoveIcon />
                  </button>
                </div>
              ) : null}
            </li>
            );
          })}
          {fileAttachments.map((file) => {
            const fileName = file.originalFilename || "attachment";
            const isPdf = fileName.toLowerCase().endsWith(".pdf");
            const fileIcon = (
              <span
                className="task-link-attachments__icon"
                aria-hidden="true"
              >
                {isPdf ? (
                  <PdfFileIcon size={16} />
                ) : (
                  <FileTypeIcon pathValue={fileName} size={16} />
                )}
              </span>
            );
            return (
            <li key={`file:${file.id}`} className="task-link-attachments__row">
              {onOpenFile ? (
                <button
                  type="button"
                  className="task-link-attachments__link task-link-attachments__link--button"
                  title={fileName}
                  onClick={() => onOpenFile(file.id)}
                >
                  {fileIcon}
                  <span className="task-link-attachments__label">
                    {fileName}
                  </span>
                  <span className="task-link-attachments__meta">
                    {formatFileBytes(file.byteSize)}
                  </span>
                </button>
              ) : (
                <span className="task-link-attachments__link">
                  {fileIcon}
                  <span className="task-link-attachments__label">
                    {fileName}
                  </span>
                  <span className="task-link-attachments__meta">
                    {formatFileBytes(file.byteSize)}
                  </span>
                </span>
              )}
              {canUploadFiles && onRemoveFile ? (
                <div className="task-link-attachments__actions">
                  <button
                    type="button"
                    className="task-link-attachments__action"
                    aria-label={`Remove ${fileName}`}
                    title={`Remove ${fileName}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRemoveFile(file.id);
                    }}
                  >
                    <RemoveIcon />
                  </button>
                </div>
              ) : null}
            </li>
            );
          })}
        </ul>
      ) : null}

      {modalOpen && portalTarget
        ? createPortal(
            <div
              className="entity-delete-modal-root"
              data-blocking-modal=""
              data-task-link-modal=""
            >
              <button
                type="button"
                aria-label="Cancel"
                className="entity-delete-modal-backdrop"
                onClick={closeModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="entity-delete-modal task-link-attachments-modal"
              >
                <h2 id={titleId} className="entity-delete-modal-title">
                  {editingLinkId ? "Edit attachment" : "Add attachment"}
                </h2>
                {!editingLinkId && kindOptions.length > 1 ? (
                  <div className="task-link-attachments-modal__kind">
                    <SegmentedPillToggle
                      value={attachKind}
                      options={[...kindOptions]}
                      onChange={setAttachKind}
                      ariaLabel="Attachment type"
                    />
                  </div>
                ) : null}
                {attachKind === "url" || editingLinkId ? (
                  <>
                    <p className="entity-delete-modal-body">
                      {editingLinkId
                        ? "Update the link URL for this attachment."
                        : "Paste a link to attach it to this task."}
                    </p>
                    <form
                      className="task-link-attachments-modal__form"
                      onSubmit={handleSave}
                    >
                      <label className="task-link-attachments-modal__label">
                        <span className="sr-only">URL</span>
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="url"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="https://…"
                          value={draftUrl}
                          onChange={(event) => {
                            setDraftUrl(event.target.value);
                            if (formError) {
                              setFormError(null);
                            }
                          }}
                          className="task-link-attachments-modal__input"
                        />
                      </label>
                      {formError ? (
                        <p className="entity-delete-modal-error" role="alert">
                          {formError}
                        </p>
                      ) : null}
                      <div className="entity-delete-modal-actions">
                        <button
                          type="button"
                          className="entity-delete-modal-cancel"
                          onClick={closeModal}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="entity-delete-modal-confirm"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  </>
                ) : attachKind === "file" ? (
                  <>
                    <p className="entity-delete-modal-body">
                      Upload a file to attach it to this task.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        event.target.value = "";
                        void handleFileSelected(file);
                      }}
                    />
                    {formError ? (
                      <p className="entity-delete-modal-error" role="alert">
                        {formError}
                      </p>
                    ) : null}
                    <div className="entity-delete-modal-actions">
                      <button
                        type="button"
                        className="entity-delete-modal-cancel"
                        onClick={closeModal}
                        disabled={uploading}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="entity-delete-modal-confirm"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploading ? "Uploading…" : "Choose file"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {attachKind === "email" ? (
                      <p className="entity-delete-modal-body">
                        Search and select an email from BacksterOS.
                      </p>
                    ) : null}
                    <label className="task-link-attachments-modal__label">
                      <span className="sr-only">Search</span>
                      <input
                        ref={inputRef}
                        type="search"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={
                          attachKind === "document"
                            ? "Search documents and letters…"
                            : "Search emails…"
                        }
                        value={searchQuery}
                        onChange={(event) => {
                          setSearchQuery(event.target.value);
                          if (formError) setFormError(null);
                        }}
                        className="task-link-attachments-modal__input"
                      />
                    </label>
                    {formError ? (
                      <p className="entity-delete-modal-error" role="alert">
                        {formError}
                      </p>
                    ) : null}
                    {attachKind === "document" ? (
                      <p className="task-link-attachments-modal__section-label">
                        Documents / Letters
                      </p>
                    ) : null}
                    <ul className="task-link-attachments-modal__results">
                      {(attachKind === "document"
                        ? filteredDocuments
                        : filteredEmails
                      ).map((option) => (
                        <li key={option.id}>
                          <button
                            type="button"
                            className="task-link-attachments-modal__result"
                            onClick={() => appendLink(option.href)}
                          >
                            {option.scopeLabel ? (
                              <span className="task-link-attachments-modal__result-scope">
                                {option.scopeLabel}
                              </span>
                            ) : null}
                            <span className="task-link-attachments-modal__result-label">
                              {option.label}
                            </span>
                            {option.detail ? (
                              <span className="task-link-attachments-modal__result-detail">
                                {option.detail}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {(attachKind === "document"
                      ? filteredDocuments
                      : filteredEmails
                    ).length === 0 ? (
                      <p className="task-link-attachments-modal__empty">
                        No matches.
                      </p>
                    ) : null}
                    <div className="entity-delete-modal-actions">
                      <button
                        type="button"
                        className="entity-delete-modal-cancel"
                        onClick={closeModal}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
