import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  DownloadIcon,
  EllipsisIcon,
  Maximize2Icon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogBackdrop, DialogPortal, DialogTitle, DialogViewport } from "../ui/dialog";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  fetchServerLogSources,
  fetchServerLogs,
  wipeServerLogs,
  type ServerLogSource,
} from "./hetznerApi";

function highlightLogLine(line: string): ReactNode {
  if (line.startsWith("=== Beginning of log file ===")) {
    return <span className="text-[#c4922a]">{line}</span>;
  }

  // Nginx-style access log
  const nginx = /^(\S+)\s+(\S+)\s+(\S+)\s+(\[[^\]]+\])\s+(".*?")\s+(\d{3})\s+(\S+)(.*)$/u.exec(
    line,
  );
  if (nginx) {
    const [, ip, ident, user, time, request, status, size, rest] = nginx;
    return (
      <>
        <span className="text-[#d48a8a]">{ip}</span>
        {` ${ident} ${user} `}
        <span className="text-[#c792ea]">{time}</span>{" "}
        <span className="text-[#8fbf6a]">{request}</span>{" "}
        <span className="text-[#d4a0c8]">{status}</span>{" "}
        <span className="text-[#d4a0c8]">{size}</span>
        <span className="text-[#8fbf6a]">{rest}</span>
      </>
    );
  }

  // Kamal proxy JSON request lines
  if (line.includes('"msg":"Request"') || line.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (typeof parsed.msg === "string") {
        const host = typeof parsed.host === "string" ? parsed.host : null;
        const path = typeof parsed.path === "string" ? parsed.path : null;
        const status = parsed.status != null ? String(parsed.status) : null;
        const method = typeof parsed.method === "string" ? parsed.method : null;
        const time = typeof parsed.time === "string" ? parsed.time : null;
        return (
          <>
            {time ? <span className="text-[#c792ea]">[{time}]</span> : null}
            {time ? " " : null}
            <span className="text-[#8fbf6a]">
              {method ?? "LOG"} {host ?? ""}
              {path ?? ""}
            </span>
            {status ? (
              <>
                {" "}
                <span className="text-[#d4a0c8]">{status}</span>
              </>
            ) : null}
            <span className="text-muted-foreground"> {parsed.msg}</span>
          </>
        );
      }
    } catch {
      // fall through
    }
  }

  // SSH auth / syslog-ish
  const syslog = /^(\S+\s+\S+\s+\S+)\s+(\S+)\s+(.+)$/u.exec(line);
  if (syslog) {
    const [, time, host, rest] = syslog;
    return (
      <>
        <span className="text-[#c792ea]">{time}</span>{" "}
        <span className="text-[#d48a8a]">{host}</span>{" "}
        <span className="text-foreground/90">{rest}</span>
      </>
    );
  }

  return <span className="text-foreground/90">{line}</span>;
}

function LogsToolbar({
  expanded,
  sources,
  sourceId,
  selectedLabel,
  loadingSources,
  searchInput,
  paused,
  linesEmpty,
  onSearchChange,
  onSourceChange,
  onTogglePaused,
  onDownload,
  onDeleteContents,
  onExpand,
  onClose,
}: {
  readonly expanded: boolean;
  readonly sources: readonly ServerLogSource[];
  readonly sourceId: string;
  readonly selectedLabel: string;
  readonly loadingSources: boolean;
  readonly searchInput: string;
  readonly paused: boolean;
  readonly linesEmpty: boolean;
  readonly onSearchChange: (value: string) => void;
  readonly onSourceChange: (value: string) => void;
  readonly onTogglePaused: () => void;
  readonly onDownload: () => void;
  readonly onDeleteContents: () => void;
  readonly onExpand?: () => void;
  readonly onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto border-b border-border/60 px-4 py-3",
        expanded ? "justify-between" : "justify-end",
      )}
    >
      {expanded ? (
        <DialogTitle className="shrink-0 text-base font-medium text-foreground">Logs</DialogTitle>
      ) : null}

      <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
        <Menu>
          <MenuTrigger
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="More log actions"
            disabled={!sourceId}
          >
            <EllipsisIcon className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={onDownload} disabled={linesEmpty}>
              <DownloadIcon className="size-4" />
              Download
            </MenuItem>
            <MenuItem variant="destructive" onClick={onDeleteContents}>
              <Trash2Icon className="size-4" />
              Delete contents
            </MenuItem>
          </MenuPopup>
        </Menu>

        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="text-muted-foreground"
          aria-label={paused ? "Resume log streaming" : "Pause log streaming"}
          onClick={onTogglePaused}
        >
          {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
        </Button>

        {!expanded && onExpand ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="text-muted-foreground"
            aria-label="Expand logs"
            onClick={onExpand}
          >
            <Maximize2Icon className="size-4" />
          </Button>
        ) : null}

        <div className="relative w-44 shrink min-w-[9rem] max-w-xs grow sm:w-56">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search log"
            className="h-8 ps-8"
          />
        </div>

        <Select
          value={sourceId}
          onValueChange={(value) => {
            if (typeof value === "string") onSourceChange(value);
          }}
          disabled={loadingSources || sources.length === 0}
        >
          <SelectTrigger aria-label="Log source" className="h-8 w-auto max-w-[14rem] shrink-0">
            <SelectValue>{loadingSources ? "Loading…" : selectedLabel}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {sources.map((source) => (
              <SelectItem key={source.id} value={source.id}>
                {source.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>

        {expanded && onClose ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="text-muted-foreground"
            aria-label="Close expanded logs"
            onClick={onClose}
          >
            <XIcon className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function LogsViewer({
  error,
  loadingSources,
  loadingLogs,
  sourcesEmpty,
  lines,
  className,
}: {
  readonly error: string | null;
  readonly loadingSources: boolean;
  readonly loadingLogs: boolean;
  readonly sourcesEmpty: boolean;
  readonly lines: readonly string[];
  readonly className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    if (lines.length === 0) return;
    scrollToBottom();
  }, [lines, scrollToBottom]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (lines.length === 0) return;
      scrollToBottom();
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [lines.length, scrollToBottom]);

  return (
    <div
      ref={scrollerRef}
      className={cn(
        "overflow-auto bg-[#0b0b0b] px-4 py-4 font-mono text-[12px] leading-5",
        className,
      )}
    >
      {error ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : loadingSources && sourcesEmpty ? (
        <div className="text-sm text-muted-foreground">Discovering log sources…</div>
      ) : loadingLogs && lines.length === 0 ? (
        <div className="text-sm text-muted-foreground">Loading logs…</div>
      ) : lines.length === 0 ? (
        <div className="text-sm text-muted-foreground">No log lines found.</div>
      ) : (
        <pre className="whitespace-pre-wrap break-all">
          {lines.map((line, index) => (
            <div key={`${index}-${line.slice(0, 24)}`} className={cn(index === 0 && "mb-1")}>
              {highlightLogLine(line)}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

export function ServerLogsPanel({
  serverId,
  service = null,
}: {
  readonly serverId: string;
  readonly service?: string | null;
}) {
  const [sources, setSources] = useState<readonly ServerLogSource[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<readonly string[]>([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const refreshSources = useCallback(async () => {
    setLoadingSources(true);
    setError(null);
    try {
      const data = await fetchServerLogSources(serverId, { service });
      if (!data.ok && data.error) {
        setError(data.error);
        setSources([]);
        return;
      }
      const nextSources = data.sources ?? [];
      setSources(nextSources);
      setSourceId((current) => {
        if (current && nextSources.some((source) => source.id === current)) return current;
        const preferred = service
          ? nextSources[0]
          : (nextSources.find((source) => source.id === "docker:kamal-proxy") ??
            nextSources.find((source) => source.id === "file:auth") ??
            nextSources[0]);
        return preferred?.id ?? "";
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load log sources");
      setSources([]);
    } finally {
      setLoadingSources(false);
    }
  }, [serverId, service]);

  const refreshLogs = useCallback(async () => {
    if (!sourceId) return;
    setLoadingLogs(true);
    setError(null);
    try {
      const data = await fetchServerLogs({
        serverId,
        sourceId,
        search,
        lines: 300,
      });
      if (!data.ok && data.error) {
        setError(data.error);
        setLines([]);
        return;
      }
      setLines(data.lines ?? []);
      setSourceLabel(data.sourceLabel ?? sourceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load logs");
      setLines([]);
    } finally {
      setLoadingLogs(false);
    }
  }, [search, serverId, sourceId]);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  useEffect(() => {
    if (!sourceId || paused) return;
    void refreshLogs();
  }, [paused, refreshLogs, sourceId]);

  useEffect(() => {
    if (paused || !sourceId) return;
    const timer = window.setInterval(() => {
      void refreshLogs();
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [paused, refreshLogs, sourceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const selectedLabel = useMemo(() => {
    return sources.find((source) => source.id === sourceId)?.label ?? sourceLabel ?? "Select log";
  }, [sourceId, sourceLabel, sources]);

  function downloadLogs() {
    const body = lines.join("\n");
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeLabel = selectedLabel.replace(/[^\w.-]+/g, "-").toLowerCase() || "logs";
    anchor.href = url;
    anchor.download = `${safeLabel}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function deleteContents() {
    if (!sourceId) return;
    setError(null);
    try {
      const data = await wipeServerLogs({ serverId, sourceId });
      if (!data.ok) {
        setError(data.error ?? "Failed to wipe log contents");
        return;
      }
      setLines(["=== Beginning of log file ==="]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to wipe log contents");
    }
  }

  const toolbarProps = {
    sources,
    sourceId,
    selectedLabel,
    loadingSources,
    searchInput,
    paused,
    linesEmpty: lines.length === 0,
    onSearchChange: setSearchInput,
    onSourceChange: setSourceId,
    onTogglePaused: () => setPaused((value) => !value),
    onDownload: downloadLogs,
    onDeleteContents: () => void deleteContents(),
  } as const;

  const viewerProps = {
    error,
    loadingSources,
    loadingLogs,
    sourcesEmpty: sources.length === 0,
    lines,
  } as const;

  return (
    <>
      <section className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40">
        <LogsToolbar {...toolbarProps} expanded={false} onExpand={() => setExpanded(true)} />
        <LogsViewer {...viewerProps} className="max-h-[min(70vh,40rem)] min-h-[20rem]" />
      </section>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogViewport className="grid-rows-1 p-0">
            <DialogPrimitive.Popup
              className={cn(
                "relative flex h-dvh max-h-dvh w-screen max-w-none min-h-0 min-w-0 flex-col rounded-none border-0 bg-background p-0 text-foreground outline-none transition-[opacity,scale] duration-200 ease-in-out will-change-transform",
                "data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0",
              )}
            >
              <LogsToolbar {...toolbarProps} expanded onClose={() => setExpanded(false)} />
              <LogsViewer {...viewerProps} className="min-h-0 flex-1" />
            </DialogPrimitive.Popup>
          </DialogViewport>
        </DialogPortal>
      </Dialog>
    </>
  );
}
