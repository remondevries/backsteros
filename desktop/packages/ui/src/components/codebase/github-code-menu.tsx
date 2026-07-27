import { useEffect, useRef, useState } from "react";

import { ProjectOcticon } from "../project-octicon.js";

export function GithubCodeMenu({
  command,
  commandTitle,
  githubUrl,
}: {
  command: string;
  commandTitle: string;
  githubUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="console-pull-code-menu" ref={rootRef}>
      <button
        type="button"
        className="console-pull-code-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        Code
        <ProjectOcticon icon="triangle-down" size={12} />
      </button>
      {open ? (
        <div className="console-pull-code-panel" role="menu">
          <div className="console-pull-code-panel-header">
            <span className="console-pull-code-panel-icon" aria-hidden="true">
              <ProjectOcticon icon="terminal" size={14} />
            </span>
            <span className="console-pull-code-panel-title">{commandTitle}</span>
          </div>
          <div className="console-pull-code-command-row">
            <code className="console-pull-code-command">{command}</code>
            <button
              type="button"
              className="console-pull-code-copy"
              aria-label={copied ? "Copied" : "Copy command"}
              title={copied ? "Copied" : "Copy"}
              onClick={() => {
                void navigator.clipboard.writeText(command).then(() => {
                  setCopied(true);
                });
              }}
            >
              <ProjectOcticon icon={copied ? "check" : "copy"} size={14} />
            </button>
          </div>
          <p className="console-pull-code-panel-foot">
            Work fast with our official CLI.{" "}
            <a
              href="https://cli.github.com/"
              target="_blank"
              rel="noreferrer"
            >
              Learn more
            </a>
          </p>
          <a
            className="console-pull-code-github-link"
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
          >
            View on GitHub
            <ProjectOcticon icon="link-external" size={12} />
          </a>
        </div>
      ) : null}
    </div>
  );
}
