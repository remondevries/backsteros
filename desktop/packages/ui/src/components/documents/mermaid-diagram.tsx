"use client";

import { useEffect, useId, useRef, useState } from "react";

type MermaidDiagramProps = {
  source: string;
  className?: string;
};

let mermaidInitialized = false;

async function ensureMermaid() {
  const mermaid = (await import("mermaid")).default;
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "dark",
      flowchart: {
        htmlLabels: false,
        curve: "basis",
        padding: 16,
        nodeSpacing: 32,
        rankSpacing: 44,
        diagramPadding: 12,
      },
    });
    mermaidInitialized = true;
  }
  return mermaid;
}

export function MermaidDiagram({ source, className }: MermaidDiagramProps) {
  const reactId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = source.trim();
    if (!trimmed) return;

    let cancelled = false;

    void (async () => {
      try {
        const mermaid = await ensureMermaid();
        const renderId = `mermaid-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg } = await mermaid.render(renderId, trimmed);
        if (cancelled) return;
        if (hostRef.current) {
          hostRef.current.innerHTML = svg;
          const svgEl = hostRef.current.querySelector("svg");
          svgEl?.classList.add("doc-diagram__svg");
          svgEl?.setAttribute("role", "img");
        }
        setError(null);
      } catch (reason) {
        if (cancelled) return;
        setError(
          reason instanceof Error ? reason.message : "Could not render diagram.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reactId, source]);

  return (
    <figure className={["doc-diagram", className].filter(Boolean).join(" ")}>
      <div className="doc-diagram__canvas">
        {error ? (
          <pre className="doc-diagram__error" role="alert">
            {error}
          </pre>
        ) : (
          <div ref={hostRef} className="doc-diagram__host" />
        )}
      </div>
    </figure>
  );
}
