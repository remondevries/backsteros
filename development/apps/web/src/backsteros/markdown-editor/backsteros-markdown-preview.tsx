import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { ExpandedImageDialog } from "~/components/chat/ExpandedImageDialog";
import type { ExpandedImagePreview } from "~/components/chat/ExpandedImagePreview";

import { resolveBacksterosMarkdownImageSrc } from "../taskDescriptionImages";
import {
  splitMarkdownPreviewParagraphs,
  withSoftLineHardBreaks,
} from "./markdown-preview-paragraphs";

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

/**
 * GFM preview using desktop markdown presentation classes.
 * Resolves authenticated BacksterOS task-description image embeds.
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

  const paragraphs = splitMarkdownPreviewParagraphs(body);

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
        {paragraphs.map((paragraph, index) => (
          <PreviewParagraph
            key={`paragraph-${index}`}
            content={paragraph}
            components={components}
          />
        ))}
      </div>
      {expandedPreview ? (
        <ExpandedImageDialog preview={expandedPreview} onClose={() => setExpandedPreview(null)} />
      ) : null}
    </>
  );
}
