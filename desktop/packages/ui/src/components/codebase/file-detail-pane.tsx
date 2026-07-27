import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { shouldHandleGlobalShortcut } from "../../shortcut-guards.js";
import { SegmentedPillToggle } from "../list-board-view-shell.js";
import { useListKeyboardNavigationZone } from "../list-keyboard-navigation-provider.js";
import { FileCodeViewer } from "./file-code-viewer.js";
import { FileDeleteConfirmModal } from "./file-delete-confirm-modal.js";
import { FileEditorTabBar } from "./file-editor-tab-bar.js";
import { filePreviewKind } from "./fs-file-preview.js";
import { isFsTreeKeyboardActive } from "./fs-tree-create-shortcut.js";
import type { ProjectFsClient } from "./project-fs-types.js";
import { UnsavedFileCloseModal } from "./unsaved-file-close-modal.js";

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
  rawUrl: string | null;
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
    rawUrl: null,
  };
}

function FileImagePreview({ src, alt }: { src: string; alt: string }) {
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

export type FileDetailPaneProps = {
  workingDirectory: string;
  openPaths: string[];
  activePath: string;
  fs: ProjectFsClient;
  editorFocusRequest?: number;
  /** Parent ⌘W / close shortcuts should call this instead of onClosePath. */
  requestClosePathRef?: MutableRefObject<((path: string) => void) | null>;
  onActivatePath: (path: string) => void;
  onClosePath: (path: string) => void;
  onFileDeleted?: (path: string) => void;
};

export function FileDetailPane({
  workingDirectory,
  openPaths,
  activePath,
  fs,
  editorFocusRequest = 0,
  requestClosePathRef,
  onActivatePath,
  onClosePath,
  onFileDeleted,
}: FileDetailPaneProps) {
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
    let cancelled = false;

    if (previewKind === "image") {
      updateSession(filePath, {
        loading: true,
        error: null,
        payload: null,
        draft: null,
        saved: null,
        rawUrl: null,
      });
      void (async () => {
        try {
          const rawUrl = fs.readRawUrl
            ? await fs.readRawUrl(workingDirectory, filePath)
            : null;
          if (cancelled) return;
          if (!rawUrl) {
            updateSession(filePath, {
              loading: false,
              error: "Image preview is unavailable.",
              rawUrl: null,
            });
            return;
          }
          updateSession(filePath, {
            loading: false,
            error: null,
            rawUrl,
          });
        } catch (loadError: unknown) {
          if (cancelled) return;
          updateSession(filePath, {
            loading: false,
            error:
              loadError instanceof Error
                ? loadError.message
                : "Could not open image.",
          });
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const existing = sessionsRef.current[filePath];
    if (
      existing &&
      !existing.loading &&
      (existing.draft != null || existing.payload?.binary)
    ) {
      return;
    }

    updateSession(filePath, {
      loading: true,
      error: null,
      saveError: null,
      payload: null,
    });

    void (async () => {
      try {
        const data = await fs.readFile(workingDirectory, filePath);
        if (cancelled) return;
        if (data.error) {
          throw new Error(data.error);
        }
        let rawUrl: string | null = null;
        if (previewKind === "svg" && fs.readRawUrl) {
          rawUrl = await fs.readRawUrl(workingDirectory, filePath);
        }
        if (cancelled) return;
        updateSession(filePath, {
          payload: data,
          draft: !data.binary && data.content != null ? data.content : null,
          saved: !data.binary && data.content != null ? data.content : null,
          loading: false,
          error: null,
          rawUrl,
        });
      } catch (loadError: unknown) {
        if (cancelled) return;
        updateSession(filePath, {
          loading: false,
          error:
            loadError instanceof Error
              ? loadError.message
              : "Could not open file.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filePath, fs, previewKind, updateSession, workingDirectory]);

  const [pendingClosePath, setPendingClosePath] = useState<string | null>(null);
  const [closeSaveError, setCloseSaveError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const previewSrc = useMemo(() => {
    if (!session.rawUrl) return null;
    const sep = session.rawUrl.includes("?") ? "&" : "?";
    return `${session.rawUrl}${sep}v=${session.previewRevision}`;
  }, [session.previewRevision, session.rawUrl]);

  const savePath = useCallback(
    async (path: string): Promise<boolean> => {
      const entry = sessionsRef.current[path];
      if (!isSessionDirty(entry) || entry?.saving || entry?.draft == null) {
        return !isSessionDirty(entry);
      }
      updateSession(path, { saving: true, saveError: null });
      try {
        const data = await fs.writeFile(workingDirectory, path, entry.draft);
        let rawUrl = entry.rawUrl;
        if (fs.readRawUrl && filePreviewKind(path) !== "text") {
          rawUrl = (await fs.readRawUrl(workingDirectory, path)) ?? rawUrl;
        }
        updateSession(path, {
          saved: entry.draft,
          payload: data,
          saving: false,
          previewRevision: entry.previewRevision + 1,
          rawUrl,
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
    [fs, updateSession, workingDirectory],
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
      await fs.deleteEntry(workingDirectory, filePath);
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
  }, [deleting, filePath, fs, onClosePath, onFileDeleted, workingDirectory]);

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
    <div ref={paneRef} className="console-pane console-pane--file-detail">
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
          previewSrc ? (
            <FileImagePreview src={previewSrc} alt={fileName} />
          ) : (
            <p className="console-github-pane-status">
              Image preview requires fs.readRawUrl.
            </p>
          )
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
