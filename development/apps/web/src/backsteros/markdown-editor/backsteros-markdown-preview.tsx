import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ExpandedImageDialog } from "~/components/chat/ExpandedImageDialog";
import type { ExpandedImagePreview } from "~/components/chat/ExpandedImagePreview";

import { resolveBacksterosMarkdownImageSrc } from "../taskDescriptionImages";

export type BacksterosMarkdownPreviewProps = {
  body: string;
  className?: string;
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
  src?: string | null;
  alt?: string | null;
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

/**
 * GFM preview using desktop markdown presentation classes.
 * Resolves authenticated BacksterOS task-description image embeds.
 */
export function BacksterosMarkdownPreview({ body, className }: BacksterosMarkdownPreviewProps) {
  const [expandedPreview, setExpandedPreview] = useState<ExpandedImagePreview | null>(null);

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
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
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
          }}
        >
          {body}
        </ReactMarkdown>
      </div>
      {expandedPreview ? (
        <ExpandedImageDialog preview={expandedPreview} onClose={() => setExpandedPreview(null)} />
      ) : null}
    </>
  );
}
