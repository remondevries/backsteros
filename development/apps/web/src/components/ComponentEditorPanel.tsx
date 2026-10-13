import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { EditorView } from "@codemirror/view";
import type { EnvironmentId } from "@t3tools/contracts";
import { executeAtomQuery } from "@t3tools/client-runtime/state/runtime";
import CodeMirror from "@uiw/react-codemirror";
import { Link2Icon, MoonIcon, RefreshCwIcon, SunIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import {
  confirmProjectFileQueryData,
  getProjectFileQueryAtom,
  setProjectFileQueryData,
} from "~/components/files/projectFilesQueryState";
import { ThemeColorPicker } from "~/components/settings/ThemeColorPicker";

import {
  COMPONENT_EDITOR_FRAMEWORKS,
  COMPONENT_EDITOR_RELATIVE_PATH,
  composeComponentEditorDocument,
  componentEditorCanvasColor,
  componentEditorPreviewSrcDoc,
  isComponentEditorFramework,
  normalizeComponentEditorCanvasColor,
  parseComponentEditorDocument,
} from "./componentEditorDocument";
import { type ComponentEditorTab, useComponentEditorStore } from "./componentEditorStore";

const SAVE_DEBOUNCE_MS = 450;
const DISK_POLL_MS = 2500;

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "12px",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
    lineHeight: "1.45",
  },
  ".cm-content": {
    padding: "12px 0",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
  },
});

export type ComponentEditorPanelProps = {
  environmentId?: EnvironmentId | null;
  cwd?: string | null;
};

/**
 * Split Component editor: HTML/CSS on top, sandboxed live preview below.
 * When a project is open, content syncs to `.backsterdev/component-editor.html`
 * so agents can read, write, and reuse the same document elsewhere.
 */
export function ComponentEditorPanel({
  environmentId = null,
  cwd = null,
}: ComponentEditorPanelProps) {
  const htmlSource = useComponentEditorStore((state) => state.html);
  const cssSource = useComponentEditorStore((state) => state.css);
  const framework = useComponentEditorStore((state) => state.framework);
  const canvas = useComponentEditorStore((state) => state.canvas);
  const appearance = useComponentEditorStore((state) => state.appearance);
  const activeTab = useComponentEditorStore((state) => state.activeTab);
  const setHtml = useComponentEditorStore((state) => state.setHtml);
  const setCss = useComponentEditorStore((state) => state.setCss);
  const setFramework = useComponentEditorStore((state) => state.setFramework);
  const setCanvas = useComponentEditorStore((state) => state.setCanvas);
  const setAppearance = useComponentEditorStore((state) => state.setAppearance);
  const setActiveTab = useComponentEditorStore((state) => state.setActiveTab);
  const replaceDocument = useComponentEditorStore((state) => state.replaceDocument);

  const writeFile = useAtomCommand(projectEnvironment.writeFile);
  const [diskReady, setDiskReady] = useState(!environmentId || !cwd);
  const [canvasHexDraft, setCanvasHexDraft] = useState<string | null>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const suppressDiskPollUntilRef = useRef(0);
  const canSyncDisk = Boolean(environmentId && cwd);
  const canvasColor = componentEditorCanvasColor(canvas);

  const previewSrcDoc = useMemo(
    () => componentEditorPreviewSrcDoc(htmlSource, cssSource, framework, canvas, appearance),
    [appearance, canvas, cssSource, framework, htmlSource],
  );

  const composedDocument = useMemo(
    () => composeComponentEditorDocument(htmlSource, cssSource, framework, canvas, appearance),
    [appearance, canvas, cssSource, framework, htmlSource],
  );

  const applyDiskContents = useCallback(
    (contents: string) => {
      const parsed = parseComponentEditorDocument(contents);
      replaceDocument(parsed);
      lastWrittenRef.current = composeComponentEditorDocument(
        parsed.html,
        parsed.css,
        parsed.framework,
        parsed.canvas,
        parsed.appearance,
      );
    },
    [replaceDocument],
  );

  const frameworkLabel =
    COMPONENT_EDITOR_FRAMEWORKS.find((entry) => entry.id === framework)?.label ?? "Vanilla CSS";

  const onFrameworkChange = (value: string | null) => {
    if (value && isComponentEditorFramework(value)) {
      setFramework(value);
    }
  };

  const onCanvasPickerChange = (value: string) => {
    setCanvasHexDraft(null);
    const normalized = normalizeComponentEditorCanvasColor(value);
    if (normalized) setCanvas(normalized);
  };

  const onCanvasHexChange = (value: string) => {
    setCanvasHexDraft(value);
    const normalized = normalizeComponentEditorCanvasColor(value);
    if (normalized) setCanvas(normalized);
  };

  const loadFromDisk = useCallback(async () => {
    if (!environmentId || !cwd) {
      setDiskReady(true);
      return;
    }
    setDiskReady(false);
    const result = await executeAtomQuery(
      appAtomRegistry,
      getProjectFileQueryAtom(environmentId, cwd, COMPONENT_EDITOR_RELATIVE_PATH),
      { reportDefect: false, reportFailure: false, refresh: true },
    );
    if (result._tag !== "Success") {
      setDiskReady(true);
      return;
    }
    if (result.value.truncated) {
      setDiskReady(true);
      return;
    }
    applyDiskContents(result.value.contents);
    setDiskReady(true);
  }, [applyDiskContents, cwd, environmentId]);

  useEffect(() => {
    void loadFromDisk();
  }, [loadFromDisk]);

  // Poll so agent writes to the file show up in the editors + preview.
  useEffect(() => {
    if (!environmentId || !cwd) return;
    const timer = window.setInterval(() => {
      if (Date.now() < suppressDiskPollUntilRef.current) return;
      void (async () => {
        const result = await executeAtomQuery(
          appAtomRegistry,
          getProjectFileQueryAtom(environmentId, cwd, COMPONENT_EDITOR_RELATIVE_PATH),
          { reportDefect: false, reportFailure: false, refresh: true },
        );
        if (result._tag !== "Success" || result.value.truncated) return;
        if (result.value.contents === lastWrittenRef.current) return;
        applyDiskContents(result.value.contents);
      })();
    }, DISK_POLL_MS);
    return () => window.clearInterval(timer);
  }, [applyDiskContents, cwd, environmentId]);

  useEffect(() => {
    if (!environmentId || !cwd || !diskReady) return;
    if (composedDocument === lastWrittenRef.current) return;
    const handle = window.setTimeout(() => {
      void (async () => {
        const contents = composedDocument;
        suppressDiskPollUntilRef.current = Date.now() + SAVE_DEBOUNCE_MS + 500;
        setProjectFileQueryData(environmentId, cwd, COMPONENT_EDITOR_RELATIVE_PATH, contents);
        const result = await writeFile({
          environmentId,
          input: {
            cwd,
            relativePath: COMPONENT_EDITOR_RELATIVE_PATH,
            contents,
          },
        });
        if (result._tag === "Success") {
          lastWrittenRef.current = contents;
          confirmProjectFileQueryData(environmentId, cwd, COMPONENT_EDITOR_RELATIVE_PATH, contents);
        }
      })();
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [composedDocument, cwd, diskReady, environmentId, writeFile]);

  const onTab = (tab: ComponentEditorTab) => setActiveTab(tab);

  const editorValue = activeTab === "html" ? htmlSource : cssSource;
  const onEditorChange = useCallback(
    (value: string) => {
      if (activeTab === "html") setHtml(value);
      else setCss(value);
    },
    [activeTab, setCss, setHtml],
  );

  const extensions = useMemo(
    () => [activeTab === "html" ? html() : css(), editorTheme, EditorView.lineWrapping],
    [activeTab],
  );

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(COMPONENT_EDITOR_RELATIVE_PATH);
    } catch {
      // Clipboard may be unavailable in some hosts; ignore quietly.
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-component-editor-panel="">
      <div className="flex min-h-0 flex-1 flex-col">
        <section className="flex min-h-0 flex-1 flex-col border-b border-border/70">
          <div className="flex shrink-0 items-center gap-1 border-b border-border/50 px-2 py-1">
            <div
              className="flex min-w-0 flex-1 items-center gap-1"
              role="tablist"
              aria-label="Editor language"
            >
              {(
                [
                  { id: "html", label: "HTML" },
                  { id: "css", label: "CSS" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    activeTab === tab.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => onTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground"
                      aria-label="Copy workspace file path"
                      onClick={() => void copyPath()}
                    />
                  }
                >
                  <Link2Icon className="size-3.5" />
                </TooltipTrigger>
                <TooltipPopup>
                  <p>Copy path</p>
                </TooltipPopup>
              </Tooltip>
              {canSyncDisk ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        aria-label="Reload from disk"
                        onClick={() => void loadFromDisk()}
                      />
                    }
                  >
                    <RefreshCwIcon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup>
                    <p>Reload from disk</p>
                  </TooltipPopup>
                </Tooltip>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CodeMirror
              key={activeTab}
              value={editorValue}
              height="100%"
              theme="dark"
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: true,
              }}
              extensions={extensions}
              onChange={onEditorChange}
              className="h-full [&_.cm-editor]:h-full [&_.cm-editor]:outline-none"
            />
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col bg-black/40">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Preview
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex items-center gap-1" title="Preview appearance">
                <SunIcon
                  className={cn(
                    "size-3.5",
                    appearance === "light" ? "text-foreground" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <Switch
                  size="sm"
                  checked={appearance === "dark"}
                  aria-label="Preview dark mode"
                  onCheckedChange={(checked) => setAppearance(checked ? "dark" : "light")}
                />
                <MoonIcon
                  className={cn(
                    "size-3.5",
                    appearance === "dark" ? "text-foreground" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
              </div>
              <Select value={framework} onValueChange={onFrameworkChange}>
                <SelectTrigger
                  size="xs"
                  variant="ghost"
                  className="w-auto min-w-28"
                  aria-label="CSS framework"
                >
                  <SelectValue>{frameworkLabel}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {COMPONENT_EDITOR_FRAMEWORKS.map((entry) => (
                    <SelectItem hideIndicator key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <div className="flex items-center gap-1.5">
                <ThemeColorPicker
                  label="Preview background"
                  value={canvasColor}
                  onChange={onCanvasPickerChange}
                />
                <input
                  value={canvasHexDraft ?? canvasColor}
                  onChange={(event) => onCanvasHexChange(event.currentTarget.value)}
                  onBlur={() => setCanvasHexDraft(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  className="h-6 w-[4.75rem] rounded-md border border-border/70 bg-background px-1.5 font-mono text-[11px] text-foreground outline-none focus:border-ring"
                  aria-label="Preview background hex"
                  spellCheck={false}
                  placeholder="#0a0a0a"
                />
              </div>
            </div>
          </div>
          <iframe
            title="Component editor preview"
            className="min-h-0 flex-1 border-0"
            style={{ backgroundColor: canvasColor }}
            sandbox="allow-scripts allow-forms allow-modals"
            srcDoc={previewSrcDoc}
          />
        </section>
      </div>
    </div>
  );
}
