import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type BacksterosMarkdownPreviewProps = {
  body: string;
  className?: string;
};

/**
 * GFM preview using desktop markdown presentation classes.
 */
export function BacksterosMarkdownPreview({ body, className }: BacksterosMarkdownPreviewProps) {
  return (
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
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
