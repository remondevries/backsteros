import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { ExpandedImageDialog } from "~/components/chat/ExpandedImageDialog";
import type { ExpandedImagePreview } from "~/components/chat/ExpandedImagePreview";

import { BacksterosMentionChip } from "../mentions/MentionChip";
import {
  getMentionTokenCacheKey,
  segmentMarkdownWithMentions,
  type MentionSegment,
} from "../mentions/mention-tokens";
import { useResolvedMentions } from "../mentions/useResolvedMentions";
import { resolveBacksterosMarkdownImageSrc } from "../taskDescriptionImages";
import {
  splitMarkdownPreviewParagraphs,
  withSoftLineHardBreaks,
} from "./markdown-preview-paragraphs";
import "./markdown-editor.css";

export type BacksterosMarkdownPreviewProps = {
  body: string;
  className?: string | undefined;
};

/**
 * Authenticated / relative markdown image src → displayable URL.
 * Owns blob: URL lifetime for task-description images.
 * Click opens T3 Code's shared ExpandedImageDialog (same modal as chat).
 */
function MarkdownPreviewImage({
  src,
  alt,
  onExpand,
}: {
  src?: string | null | undefined;
  alt?: string | null | undefined;
  onExpand: (preview: ExpandedImagePreview) => void;
}) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const revoke = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    void (async () => {
      revoke();
      if (!src) {
        if (!cancelled) setDisplaySrc(null);
        return;
      }
      try {
        const next = await resolveBacksterosMarkdownImageSrc(src);
        if (cancelled) {
          if (next?.startsWith("blob:")) URL.revokeObjectURL(next);
          return;
        }
        if (next && next.startsWith("blob:")) {
          objectUrlRef.current = next;
        }
        setDisplaySrc(next ?? src);
      } catch {
        if (!cancelled) setDisplaySrc(null);
      }
    })();

    return () => {
      cancelled = true;
      revoke();
    };
  }, [src]);

  const previewName = alt?.trim() || "image";

  const expand = useCallback(
    (event: ReactMouseEvent | ReactKeyboardEvent) => {
      if (!displaySrc) return;
      // Linked images stay as navigation targets.
      if (event.currentTarget.closest("a")) return;
      event.preventDefault();
      event.stopPropagation();
      onExpand({
        images: [{ src: displaySrc, name: previewName }],
        index: 0,
      });
    },
    [displaySrc, onExpand, previewName],
  );

  if (!displaySrc) return null;

  return (
    <img
      src={displaySrc}
      alt={alt ?? ""}
      role="button"
      tabIndex={0}
      aria-label={`Preview ${previewName}`}
      className="content-markdown-preview-image content-markdown-preview-image--expandable"
      onClick={expand}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") expand(event);
      }}
    />
  );
}

function BlankParagraph() {
  return (
    <p className="content-markdown-preview-blank-line" aria-hidden="true">
      <br />
    </p>
  );
}

function PreviewParagraph({ content, components }: { content: string; components: Components }) {
  if (content.trim() === "") {
    return <BlankParagraph />;
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {withSoftLineHardBreaks(content)}
    </ReactMarkdown>
  );
}

function resolveMentionLayout(
  segments: readonly MentionSegment[],
  index: number,
): "inline" | "block" {
  const segment = segments[index];
  if (!segment || segment.type !== "mention") return "inline";
  if (
    segment.token.kind !== "task" &&
    segment.token.kind !== "project" &&
    segment.token.kind !== "letter"
  ) {
    return "inline";
  }

  const prev = segments[index - 1];
  const next = segments[index + 1];
  const prevOk =
    prev == null || (prev.type === "markdown" && /^\s*$/.test(prev.content.replace(/^\n+/, "")));
  const nextOk =
    next == null || (next.type === "markdown" && /^\s*$/.test(next.content.replace(/\n+$/, "")));

  // Standalone mention on its own line(s) → block card.
  if (prev == null && next == null) return "block";
  if (
    prev?.type === "markdown" &&
    (prev.content.endsWith("\n") || prev.content === "") &&
    next?.type === "markdown" &&
    (next.content.startsWith("\n") || next.content === "")
  ) {
    return "block";
  }
  if (prevOk && nextOk && prev?.type === "markdown" && next?.type === "markdown") {
    const before = prev.content;
    const after = next.content;
    if (/(^|\n)\s*$/.test(before) && /^\s*(\n|$)/.test(after)) {
      return "block";
    }
  }
  return "inline";
}

function MentionAwareBody({ body, components }: { body: string; components: Components }) {
  const segments = useMemo(() => segmentMarkdownWithMentions(body), [body]);
  const { byKey } = useResolvedMentions(body);

  const hasMentions = segments.some((segment) => segment.type === "mention");
  if (!hasMentions) {
    const paragraphs = splitMarkdownPreviewParagraphs(body);
    return (
      <>
        {paragraphs.map((paragraph, index) => (
          <PreviewParagraph
            key={`paragraph-${index}`}
            content={paragraph}
            components={components}
          />
        ))}
      </>
    );
  }

  const nodes: ReactNode[] = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    if (segment.type === "mention") {
      const layout = resolveMentionLayout(segments, index);
      const key = getMentionTokenCacheKey(segment.token);
      nodes.push(
        <BacksterosMentionChip
          key={`mention-${index}-${key}`}
          token={segment.token}
          resolved={byKey.get(key)}
          layout={layout}
        />,
      );
      continue;
    }

    const paragraphs = splitMarkdownPreviewParagraphs(segment.content);
    for (let p = 0; p < paragraphs.length; p++) {
      nodes.push(
        <PreviewParagraph
          key={`md-${index}-${p}`}
          content={paragraphs[p]!}
          components={components}
        />,
      );
    }
  }

  return <>{nodes}</>;
}

/**
 * GFM preview using desktop markdown presentation classes.
 * Resolves authenticated BacksterOS task-description image embeds.
 * Renders `[@task:…]` (and other) mention tokens as polished chips.
 * Blank lines match the editor (desktop DocumentMarkdownPreview parity).
 */
export function BacksterosMarkdownPreview({ body, className }: BacksterosMarkdownPreviewProps) {
  const [expandedPreview, setExpandedPreview] = useState<ExpandedImagePreview | null>(null);

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children, ...props }) => (
        <a
          {...props}
          href={href}
          className="content-markdown-preview-link"
          target={href?.startsWith("http") ? "_blank" : undefined}
          rel={href?.startsWith("http") ? "noreferrer" : undefined}
        >
          {children}
        </a>
      ),
      img: ({ src, alt }) => (
        <MarkdownPreviewImage src={src} alt={alt} onExpand={setExpandedPreview} />
      ),
    }),
    [],
  );

  return (
    <>
      <div
        className={[
          "content-markdown-preview-body",
          "content-markdown-preview-body--rendered",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <MentionAwareBody body={body} components={components} />
      </div>
      {expandedPreview ? (
        <ExpandedImageDialog preview={expandedPreview} onClose={() => setExpandedPreview(null)} />
      ) : null}
    </>
  );
}
