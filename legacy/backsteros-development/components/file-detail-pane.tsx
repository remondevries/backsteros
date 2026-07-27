"use client";

import {
  SegmentedPillToggle,
  shouldHandleGlobalShortcut,
  useListKeyboardNavigationZone,
} from "@backsteros/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { ConsoleProjectBreadcrumbHeader } from "@/components/console-project-breadcrumb-header";
import { FileCodeViewer } from "@/components/file-code-viewer";
import { FileDeleteConfirmModal } from "@/components/file-delete-confirm-modal";
import { FileEditorTabBar } from "@/components/file-editor-tab-bar";
import { UnsavedFileCloseModal } from "@/components/unsaved-file-close-modal";
import {
  buildFsRawFileUrl,
  filePreviewKind,
} from "@/lib/fs-file-preview";
import { isFsTreeKeyboardActive } from "@/lib/fs-tree-create-shortcut";

type FilePayload = {
  path: string;
  name: string;
  size: number;
  binary: boolean;
  content: string | null;
  error?: string;
};

type SvgViewMode = "preview" | "code";

type FileSession = {
  payload: FilePayload | null;
  draft: string | null;
  saved: string | null;
  loading: boolean;
  error: string | null;
  saveError: string | null;
  saving: boolean;
  previewRevision: number;
  svgView: SvgViewMode;
};

function isSessionDirty(entry: FileSession | undefined): boolean {
  return (
    entry != null &&
    entry.draft != null &&
    entry.saved != null &&
    entry.draft !== entry.saved
  );
}

function fileLabel(path: string): string {
  return path.split("/").pop() || path;
}

const SVG_VIEW_OPTIONS = [
  { value: "preview" as const, label: "Preview" },
  { value: "code" as const, label: "Code" },
];

function emptySession(loading = true): FileSession {
  return {
    payload: null,
    draft: null,
    saved: null,
    loading,
    error: null,
    saveError: null,
    saving: false,
    previewRevision: 0,
    svgView: "preview",
  };
}

function FileImagePreview({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <p className="console-github-pane-error" role="alert">
        Could not load image preview.
      </p>
    );
  }

  return (
    <div className="console-file-image-preview">
      <img
        src={src}
        alt={alt}
        className="console-file-image-preview-img"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function FileDetailPane({
  projectIcon,
  projectName,
  workingDirectory,
  openPaths,
  activePath,
  showChromeHeader = true,
  editorFocusRequest = 0,
  requestClosePathRef,
  onActivatePath,
  onClosePath,
  onClose,
  onNavigateToProject,
  onFileDeleted,
}: {
  projectIcon?: string | null;
  projectName: string;
  workingDirectory: string;
  openPaths: string[];
  activePath: string;
  showChromeHeader?: boolean;
  editorFocusRequest?: number;
  /** Parent ⌘W / close shortcuts should call this instead of onClosePath. */
  requestClosePathRef?: MutableRefObject<((path: string) => void) | null>;
  onActivatePath: (path: string) => void;
  onClosePath: (path: string) => void;
  onClose: () => void;
  onNavigateToProject?: () => void;
  onFileDeleted?: (path: string) => void;
}) {
  const { setActiveZone } = useListKeyboardNavigationZone();
  const leaveEditor = useCallback(() => {
    setActiveZone("content", { activate: true });
  }, [setActiveZone]);
  const filePath = activePath;
  const fileName = filePath.split("/").pop() || filePath;
  const previewKind = filePreviewKind(filePath);
  const [sessions, setSessions] = useState<Record<string, FileSession>>({});
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const session = sessions[filePath] ?? emptySession(previewKind !== "image");
  const dirtyPaths = useMemo(
    () =>
      Object.entries(sessions)
        .filter(
          ([, entry]) =>
            entry.draft != null &&
            entry.saved != null &&
            entry.draft !== entry.saved,
        )
        .map(([path]) => path),
    [sessions],
  );

  const updateSession = useCallback(
    (path: string, patch: Partial<FileSession>) => {
      setSessions((current) => ({
        ...current,
        [path]: { ...(current[path] ?? emptySession(false)), ...patch },
      }));
    },
    [],
  );

  useEffect(() => {
    setSessions((current) => {
      const open = new Set(openPaths);
      let changed = false;
      const next: Record<string, FileSession> = {};
      for (const [path, entry] of Object.entries(current)) {
        if (open.has(path)) {
          next[path] = entry;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [openPaths]);

  useEffect(() => {
    if (previewKind === "image") {
      updateSession(filePath, {
        loading: false,
        error: null,
        payload: null,
        draft: null,
        saved: null,
      });
      return;
    }

    const existing = sessionsRef.current[filePath];
    if (
      existing &&
      !existing.loading &&
      (existing.draft != null || existing.payload?.binary)
    ) {
      return;
    }

    const controller = new AbortController();
    updateSession(filePath, {
      loading: true,
      error: null,
      saveError: null,
      payload: null,
    });
    const url = new URL("/api/fs/file", window.location.origin);
    url.searchParams.set("root", workingDirectory);
    url.searchParams.set("path", filePath);
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as FilePayload;
        if (!response.ok) {
          throw new Error(data.error || "Could not open file.");
        }
        return data;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        updateSession(filePath, {
          payload: data,
          draft: !data.binary && data.content != null ? data.content : null,
          saved: !data.binary && data.content != null ? data.content : null,
          loading: false,
          error: null,
        });
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        if ((loadError as { name?: string }).name === "AbortError") return;
        updateSession(filePath, {
          loading: false,
          error:
            loadError instanceof Error
              ? loadError.message
              : "Could not open file.",
        });
      });
    return () => controller.abort();
  }, [filePath, previewKind, updateSession, workingDirectory]);

  const [pendingClosePath, setPendingClosePath] = useState<string | null>(null);
  const [closeSaveError, setCloseSaveError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rawUrl = useMemo(() => {
    const url = buildFsRawFileUrl(workingDirectory, filePath);
    return `${url}&v=${session.previewRevision}`;
  }, [filePath, session.previewRevision, workingDirectory]);

  const savePath = useCallback(
    async (path: string): Promise<boolean> => {
      const entry = sessionsRef.current[path];
      if (!isSessionDirty(entry) || entry?.saving || entry?.draft == null) {
        return !isSessionDirty(entry);
      }
      updateSession(path, { saving: true, saveError: null });
      try {
        const response = await fetch("/api/fs/file", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            root: workingDirectory,
            path,
            content: entry.draft,
          }),
        });
        const data = (await response.json()) as FilePayload;
        if (!response.ok) {
          throw new Error(data.error || "Could not save file.");
        }
        updateSession(path, {
          saved: entry.draft,
          payload: data,
          saving: false,
          previewRevision: entry.previewRevision + 1,
        });
        return true;
      } catch (saveErr: unknown) {
        const message =
          saveErr instanceof Error ? saveErr.message : "Could not save file.";
        updateSession(path, {
          saving: false,
          saveError: message,
        });
        return false;
      }
    },
    [updateSession, workingDirectory],
  );

  const saveFile = useCallback(async () => {
    await savePath(filePath);
  }, [filePath, savePath]);

  const requestClosePath = useCallback(
    (path: string) => {
      if (isSessionDirty(sessionsRef.current[path])) {
        setCloseSaveError(null);
        setPendingClosePath(path);
        return;
      }
      onClosePath(path);
    },
    [onClosePath],
  );

  useEffect(() => {
    if (!requestClosePathRef) return;
    requestClosePathRef.current = requestClosePath;
    return () => {
      requestClosePathRef.current = null;
    };
  }, [requestClosePath, requestClosePathRef]);

  const confirmCloseSave = useCallback(async () => {
    if (!pendingClosePath) return;
    setCloseSaveError(null);
    const ok = await savePath(pendingClosePath);
    if (!ok) {
      const entry = sessionsRef.current[pendingClosePath];
      setCloseSaveError(entry?.saveError ?? "Could not save file.");
      return;
    }
    const path = pendingClosePath;
    setPendingClosePath(null);
    onClosePath(path);
  }, [onClosePath, pendingClosePath, savePath]);

  const confirmCloseDiscard = useCallback(() => {
    if (!pendingClosePath) return;
    const path = pendingClosePath;
    setPendingClosePath(null);
    setCloseSaveError(null);
    onClosePath(path);
  }, [onClosePath, pendingClosePath]);

  const cancelClose = useCallback(() => {
    setPendingClosePath(null);
    setCloseSaveError(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const url = new URL("/api/fs/file", window.location.origin);
      url.searchParams.set("root", workingDirectory);
      url.searchParams.set("path", filePath);
      const response = await fetch(url, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not delete file.");
      }
      setDeleteModalOpen(false);
      onClosePath(filePath);
      onFileDeleted?.(filePath);
    } catch (deleteErr: unknown) {
      setDeleteError(
        deleteErr instanceof Error
          ? deleteErr.message
          : "Could not delete file.",
      );
    } finally {
      setDeleting(false);
    }
  }, [deleting, filePath, onClosePath, onFileDeleted, workingDirectory]);

  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "s" && event.key !== "S") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const pane = paneRef.current;
      if (!pane || pane.closest('[aria-hidden="true"]')) return;
      if (pendingClosePath || deleteModalOpen) return;
      event.preventDefault();
      void saveFile();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteModalOpen, pendingClosePath, saveFile]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "d" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      const pane = paneRef.current;
      if (!pane || pane.closest('[aria-hidden="true"]')) return;

      if (deleteModalOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void confirmDelete();
        return;
      }

      // Files list owns D for the highlighted tree entry while focused.
      if (
        pendingClosePath ||
        isFsTreeKeyboardActive() ||
        !shouldHandleGlobalShortcut(event)
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      setDeleteError(null);
      setDeleteModalOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [confirmDelete, deleteModalOpen, pendingClosePath]);

  const showCode =
    previewKind === "text" ||
    (previewKind === "svg" && session.svgView === "code");
  const showImagePreview =
    previewKind === "image" ||
    (previewKind === "svg" && session.svgView === "preview");
  const pendingCloseName = pendingClosePath
    ? fileLabel(pendingClosePath)
    : "";
  const closeSaving = pendingClosePath
    ? Boolean(sessions[pendingClosePath]?.saving)
    : false;

  return (
    <div
      ref={paneRef}
      className="console-pane console-pane--file-detail"
    >
      {showChromeHeader ? (
        <ConsoleProjectBreadcrumbHeader
          className="console-file-detail-chrome"
          projectIcon={projectIcon}
          projectName={projectName}
          segment={fileName}
          onNavigateToProject={onNavigateToProject ?? onClose}
          leading={
            <button
              type="button"
              className="console-commit-detail-back"
              aria-label="Back"
              onClick={onClose}
            >
              ←
            </button>
          }
        />
      ) : null}
      <FileEditorTabBar
        openPaths={openPaths}
        activePath={filePath}
        dirtyPaths={dirtyPaths}
        onActivate={onActivatePath}
        onClose={requestClosePath}
      />
      <div className="console-pane-body console-file-detail-body">
        {previewKind === "svg" ? (
          <div className="console-file-detail-toolbar">
            <SegmentedPillToggle
              value={session.svgView}
              options={SVG_VIEW_OPTIONS}
              onChange={(value) => updateSession(filePath, { svgView: value })}
              ariaLabel="SVG view mode"
            />
          </div>
        ) : null}

        {session.loading ? (
          <p className="console-github-pane-status">Loading file…</p>
        ) : null}
        {session.error ? (
          <p className="console-github-pane-error" role="alert">
            {session.error}
          </p>
        ) : null}
        {session.saveError && !pendingClosePath ? (
          <p className="console-github-pane-error" role="alert">
            {session.saveError}
          </p>
        ) : null}

        {showImagePreview && !session.loading && !session.error ? (
          <FileImagePreview src={rawUrl} alt={fileName} />
        ) : null}

        {showCode && !session.loading && !session.error ? (
          session.payload?.binary ? (
            <p className="console-github-pane-status">
              Binary file — cannot edit in the console.
            </p>
          ) : session.draft != null ? (
            <FileCodeViewer
              path={filePath}
              value={session.draft}
              onChange={(value) => updateSession(filePath, { draft: value })}
              focusRequest={editorFocusRequest}
              onLeaveEditor={leaveEditor}
            />
          ) : null
        ) : null}
      </div>

      {pendingClosePath ? (
        <UnsavedFileCloseModal
          fileName={pendingCloseName}
          saving={closeSaving}
          error={closeSaveError}
          onSave={() => {
            void confirmCloseSave();
          }}
          onDiscard={confirmCloseDiscard}
          onCancel={cancelClose}
        />
      ) : null}

      {deleteModalOpen ? (
        <FileDeleteConfirmModal
          fileName={fileName}
          deleting={deleting}
          error={deleteError}
          onConfirm={() => {
            void confirmDelete();
          }}
          onCancel={() => {
            if (deleting) return;
            setDeleteModalOpen(false);
            setDeleteError(null);
          }}
        />
      ) : null}
    </div>
  );
}
