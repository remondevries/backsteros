"use client";

import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { ClientLink } from "../client-link.js";
import { isInternalAppHref } from "../is-internal-app-href.js";
import {
  normalizeMarkdownTaskLists,
  parseMarkdownTaskCheckbox,
} from "../markdown-task-list.js";
import { getTaskListItemChecked } from "../markdown-task-list-checked.js";
import { MarkdownTaskListInteractProvider } from "../markdown-task-list-interact.js";
import { MarkdownTaskCheckbox } from "./markdown-task-checkbox.js";
import {
  useMentionCatalogOptional,
  useResolveMentionTokensInContent,
} from "../mentions/mention-catalog-context.js";
import { useMentionNavigationPathname } from "../mentions/mention-navigation-context.js";
import { EMPTY_MENTION_CATALOG } from "../mentions/empty-catalog.js";
import {
  listItemLeadingNewlinesContinueList,
  matchListItemOpener,
  resolveMentionLayout,
  type MentionChipLayout,
} from "../mentions/mention-layout.js";
import {
  resolveMentionCatalogContact,
  resolveMentionCatalogDocument,
  resolveMentionCatalogEmail,
  resolveMentionCatalogLetter,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogProject,
  resolveMentionCatalogTask,
} from "../mentions/resolve-catalog-entry.js";
import type { MentionCatalog } from "../mentions/mention-menu-types.js";
import { resolveMentionHref } from "../mentions/tokens.js";
import {
  mentionTokenLabel,
  segmentMarkdownWithMentions,
  type MentionSegment,
  type ParsedMentionToken,
} from "../mention-tokens.js";
import { resolveMentionTrailHref } from "../navigation-trail/mention-trail.js";
import { PROJECT_AREA_LABELS } from "../project-areas.js";
import {
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../task-due-date.js";
import { useContentPreviewLinkNavigation } from "../use-content-preview-link-navigation.js";
import { DocumentMentionHoverCard } from "./document-mention-hover-card.js";
import { EmailMentionBlockChip } from "./email-mention-block-chip.js";
import { LetterIcon } from "./letter-icon.js";
import { EmailNavIcon } from "./sidebar-nav-icons.js";
import { MentionChipHoverShell } from "./mention-chip-hover-shell.js";
import { MentionLeadingIcon } from "./mention-leading-icon.js";
import { TaskMentionBlockChip } from "./task-mention-block-chip.js";
import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "./project-octicon.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { MarkdownImageLightbox } from "./markdown-image-lightbox.js";

/** Resolve authenticated / relative markdown image srcs to displayable URLs. */
export type ResolveMarkdownImageSrc = (
  src: string,
) => Promise<string | null> | string | null;

const MarkdownImageResolveContext =
  createContext<ResolveMarkdownImageSrc | null>(null);

function MarkdownPreviewImage({
  src,
  alt,
}: {
  src?: string | null;
  alt?: string | null;
}) {
  const resolve = useContext(MarkdownImageResolveContext);
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [lightbox, setLightbox] = useState<{
    src: string;
    alt: string;
    rect: DOMRect;
  } | null>(null);

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
      if (!resolve) {
        if (!cancelled) setDisplaySrc(src);
        return;
      }
      try {
        const next = await resolve(src);
        if (cancelled) return;
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
  }, [resolve, src]);

  if (!displaySrc) {
    return null;
  }

  const openLightbox = () => {
    const node = imgRef.current;
    if (!node) return;
    setLightbox({
      src: displaySrc,
      alt: alt ?? "",
      rect: node.getBoundingClientRect(),
    });
  };

  return (
    <>
      <button
        type="button"
        className="content-markdown-preview-image-button"
        aria-label={alt ? `Expand image: ${alt}` : "Expand image"}
        onClick={openLightbox}
      >
        <img
          ref={imgRef}
          src={displaySrc}
          alt={alt ?? ""}
          className={[
            "content-markdown-preview-image",
            lightbox ? "content-markdown-preview-image--lightbox-open" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </button>
      {lightbox ? (
        <MarkdownImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          sourceRect={lightbox.rect}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </>
  );
}

const markdownPreviewComponents: Components = {
  a({ href, children }) {
    if (!href) {
      return <span>{children}</span>;
    }
    if (isInternalAppHref(href)) {
      return (
        <ClientLink href={href} className="content-markdown-preview-link">
          {children}
        </ClientLink>
      );
    }
    return (
      <a
        href={href}
        className="content-markdown-preview-link"
        target="_blank"
        rel="noreferrer noopener"
      >
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    return <MarkdownPreviewImage src={src} alt={alt} />;
  },
  li(props) {
    const { children, className, ...rest } = props;
    // remark-gfm puts `checked` on the child <input>, not the <li>.
    const checked = getTaskListItemChecked(props);
    const isTaskItem =
      typeof checked === "boolean" ||
      (typeof className === "string" && className.includes("task-list-item"));
    if (!isTaskItem) {
      return (
        <li className={className} {...rest}>
          {children}
        </li>
      );
    }
    // Keep body (text/code/links) in one inline flow so flex doesn't break
    // backtick code spans into separate flex items.
    const body = Children.toArray(children).filter((child) => {
      if (!isValidElement(child)) return true;
      return child.type !== "input";
    });
    const isChecked = checked === true;
    return (
      <li
        className={[className, "task-list-item"].filter(Boolean).join(" ")}
        data-checked={isChecked ? "true" : "false"}
        {...rest}
      >
        <MarkdownTaskCheckbox checked={isChecked} />
        <span className="md-task-checkbox__content">{body}</span>
      </li>
    );
  },
  input(props) {
    if (props.type === "checkbox") {
      // Visual checkbox is rendered by the custom `li`; drop the native GFM input.
      return null;
    }
    return <input {...props} />;
  },
};

const markdownRemarkPlugins = [remarkGfm];

export type DocumentMarkdownPreviewProps = {
  body: string;
  /** Override catalog; defaults to MentionCatalogProvider. */
  mentionCatalog?: MentionCatalog;
  /**
   * When set, task-list checkboxes are clickable and update this markdown
   * body (e.g. preview edits that persist via useMarkdownDetailEditor).
   */
  onChange?: (nextBody: string) => void;
  /**
   * Optional resolver for authenticated image URLs (e.g. task description
   * images under `/api/v1/tasks/.../images/...`). Return a blob: URL or the
   * original src; null hides the image.
   */
  resolveImageSrc?: ResolveMarkdownImageSrc;
};

function hasBlockMarkdown(content: string): boolean {
  return /^(\s*#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|```|>\s|\|.+\|)/m.test(
    content,
  );
}

/**
 * Split on blank-line runs while keeping empty rows visible in preview.
 * N consecutive newlines (N >= 2) become N - 1 blank paragraphs — matching
 * the empty lines the user sees in the editor.
 */
/** Inclusive ranges of fenced code blocks (``` / ~~~) so blank lines inside stay intact. */
function findFencedCodeRanges(body: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let fence: { start: number; char: string; len: number } | null = null;
  let offset = 0;
  for (const line of body.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    if (!fence) {
      const open = line.match(/^([ \t]*)(`{3,}|~{3,})/);
      if (open) {
        fence = {
          start: lineStart,
          char: open[2]![0]!,
          len: open[2]!.length,
        };
      }
    } else {
      const close = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
      if (
        close &&
        close[1]!.startsWith(fence.char) &&
        close[1]!.length >= fence.len
      ) {
        ranges.push([fence.start, lineEnd]);
        fence = null;
      }
    }
    offset = lineEnd + 1;
  }
  if (fence) {
    ranges.push([fence.start, body.length]);
  }
  return ranges;
}

function isIndexInsideRanges(
  index: number,
  ranges: Array<[number, number]>,
): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function splitParagraphs(body: string): string[] {
  if (!body) {
    return [];
  }

  // Don't split on blank lines inside fenced code — that would leak `- [ ]`
  // examples out of the fence and turn them into real checkboxes.
  const fenceRanges = findFencedCodeRanges(body);
  const parts: string[] = [];
  const blankLineRuns = /\n{2,}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blankLineRuns.exec(body)) !== null) {
    if (isIndexInsideRanges(match.index, fenceRanges)) {
      continue;
    }
    parts.push(body.slice(lastIndex, match.index));
    const blankLineCount = match[0].length - 1;
    for (let i = 0; i < blankLineCount; i += 1) {
      parts.push("");
    }
    lastIndex = match.index + match[0].length;
  }

  const rest = body.slice(lastIndex);
  if (rest.length > 0 || parts.length === 0) {
    parts.push(rest);
  }

  return parts;
}

/**
 * Soft line breaks inside a paragraph → markdown hard breaks so ReactMarkdown
 * keeps the same visual rows the editor shows with pre-wrap.
 */
function withSoftLineHardBreaks(content: string): string {
  return content.replace(/([^\n])\n(?!\n)/g, "$1  \n");
}

function BlankParagraph() {
  return (
    <p className="content-markdown-preview-blank-line" aria-hidden="true">
      <br />
    </p>
  );
}

/** Inline markdown (bold/italic/code/links) without wrapping an extra `<p>`. */
const inlineMarkdownComponents: Components = {
  ...markdownPreviewComponents,
  p({ children }) {
    return (
      <span className="content-markdown-preview-prewrap">{children}</span>
    );
  },
};

function InlineMarkdownSegment({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  // Block markdown is emitted as MarkdownBlockSegment siblings by
  // renderParagraphWithMentions — never via block ReactMarkdown under <p>.
  return (
    <ReactMarkdown
      remarkPlugins={markdownRemarkPlugins}
      components={inlineMarkdownComponents}
    >
      {withSoftLineHardBreaks(normalizeMarkdownTaskLists(content))}
    </ReactMarkdown>
  );
}

function MarkdownBlockSegment({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  return (
    <ReactMarkdown
      remarkPlugins={markdownRemarkPlugins}
      components={markdownPreviewComponents}
    >
      {normalizeMarkdownTaskLists(content)}
    </ReactMarkdown>
  );
}

function resolvePreviewChipLabel(
  token: ParsedMentionToken,
  catalog: MentionCatalog,
): { label: string; deleted: boolean } {
  switch (token.kind) {
    case "task": {
      const task = resolveMentionCatalogTask(token, catalog);
      if (!task) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: task.title || task.displayId, deleted: false };
    }
    case "letter": {
      const letter = resolveMentionCatalogLetter(token, catalog);
      if (!letter) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: letter.title || letter.displayId, deleted: false };
    }
    case "email": {
      const email = resolveMentionCatalogEmail(token, catalog);
      if (!email) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: email.title || email.displayId, deleted: false };
    }
    case "project": {
      const project = resolveMentionCatalogProject(token, catalog);
      if (!project) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: project.name, deleted: false };
    }
    case "contact": {
      const contact = resolveMentionCatalogContact(token, catalog);
      if (!contact) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: contact.name, deleted: false };
    }
    case "organization": {
      const organization = resolveMentionCatalogOrganization(token, catalog);
      if (!organization) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: organization.name, deleted: false };
    }
    case "document": {
      const document = resolveMentionCatalogDocument(token, catalog);
      if (!document) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: document.title, deleted: false };
    }
  }
}

function resolvePreviewChipIconProps(
  token: ParsedMentionToken,
  catalog: MentionCatalog,
) {
  switch (token.kind) {
    case "task": {
      const task = resolveMentionCatalogTask(token, catalog);
      return {
        kind: "task" as const,
        status: task?.status ?? null,
        projectIcon: null,
        documentIcon: null,
        contact: null,
      };
    }
    case "letter":
      return {
        kind: "letter" as const,
        status: null,
        projectIcon: null,
        documentIcon: null,
        contact: null,
      };
    case "email": {
      const email = resolveMentionCatalogEmail(token, catalog);
      return {
        kind: "email" as const,
        status: email?.status ?? null,
        projectIcon: null,
        documentIcon: null,
        contact: null,
      };
    }
    case "project": {
      const project = resolveMentionCatalogProject(token, catalog);
      return {
        kind: "project" as const,
        status: null,
        projectIcon: project?.icon ?? null,
        documentIcon: null,
        contact: null,
      };
    }
    case "contact": {
      const contact = resolveMentionCatalogContact(token, catalog);
      return {
        kind: "contact" as const,
        status: null,
        projectIcon: null,
        documentIcon: null,
        contact: contact
          ? {
              id: contact.id,
              avatarStorageKey: contact.avatarStorageKey,
              avatarUpdatedAt: contact.avatarUpdatedAt,
            }
          : null,
      };
    }
    case "organization":
      return {
        kind: "organization" as const,
        status: null,
        projectIcon: null,
        documentIcon: null,
        contact: null,
      };
    case "document": {
      const document = resolveMentionCatalogDocument(token, catalog);
      return {
        kind: "document" as const,
        status: null,
        projectIcon: null,
        documentIcon: document?.icon ?? null,
        contact: null,
      };
    }
  }
}

function renderMentionChipBody(
  token: ParsedMentionToken,
  catalog: MentionCatalog,
  layout: MentionChipLayout,
  label: string,
  deleted: boolean,
) {
  const iconProps = resolvePreviewChipIconProps(token, catalog);

  if (layout === "inline" || deleted) {
    return (
      <>
        <span className="mention-chip-lite__icon" aria-hidden="true">
          <MentionLeadingIcon
            kind={iconProps.kind}
            status={iconProps.status}
            projectIcon={iconProps.projectIcon}
            documentIcon={iconProps.documentIcon}
            contact={iconProps.contact}
          />
        </span>
        <span className="mention-chip-lite__label">{label}</span>
      </>
    );
  }

  if (token.kind === "task") {
    const task = resolveMentionCatalogTask(token, catalog);
    if (!task) {
      return (
        <>
          <span className="mention-chip-lite__icon" aria-hidden="true">
            <MentionLeadingIcon kind="task" status={null} />
          </span>
          <span className="mention-chip-lite__label">{label}</span>
        </>
      );
    }

    const dueDateLabel =
      task.dueDate != null ? formatTaskDueMetaLabel(task.dueDate) : null;

    return (
      <>
        <TaskPriorityIcon
          priority={task.priority}
          size={14}
          className="mention-chip-lite__meta-icon"
        />
        <span className="mention-chip-lite__icon" aria-hidden="true">
          <MentionLeadingIcon kind="task" status={task.status} />
        </span>
        <span className="mention-chip-lite__id">{task.displayId}</span>
        <span className="mention-chip-lite__label mention-chip-lite__label--grow">
          {task.title || task.displayId}
        </span>
        {dueDateLabel ? (
          <span className="mention-chip-lite__due">
            <TaskDueDateIcon
              active
              urgency={getTaskDueDateUrgency(task.dueDate, new Date(), {
                status: task.status,
              })}
              size={12}
            />
            <span>{dueDateLabel}</span>
          </span>
        ) : null}
        {task.projectName ? (
          <span className="mention-chip-lite__project">
            <ProjectOcticon
              icon={getDisplayProjectIcon(task.projectIcon)}
              size={12}
            />
            <span>{task.projectName}</span>
          </span>
        ) : null}
      </>
    );
  }

  if (token.kind === "letter") {
    const letter = resolveMentionCatalogLetter(token, catalog);
    if (!letter) {
      return (
        <>
          <span className="mention-chip-lite__icon" aria-hidden="true">
            <LetterIcon size={14} />
          </span>
          <span className="mention-chip-lite__label">{label}</span>
        </>
      );
    }

    const dueDateLabel =
      letter.dueDate != null ? formatTaskDueMetaLabel(letter.dueDate) : null;

    return (
      <>
        <span className="mention-chip-lite__icon" aria-hidden="true">
          <LetterIcon size={14} />
        </span>
        <span className="mention-chip-lite__id">{letter.displayId}</span>
        <span className="mention-chip-lite__label mention-chip-lite__label--grow">
          {letter.title || letter.displayId}
        </span>
        {dueDateLabel ? (
          <span className="mention-chip-lite__due">
            <TaskDueDateIcon
              active
              urgency={getTaskDueDateUrgency(letter.dueDate, new Date(), {
                status: letter.status,
              })}
              size={12}
            />
            <span>{dueDateLabel}</span>
          </span>
        ) : null}
        {letter.projectName ? (
          <span className="mention-chip-lite__project">
            <span>{letter.projectName}</span>
          </span>
        ) : null}
      </>
    );
  }

  if (token.kind === "email") {
    const email = resolveMentionCatalogEmail(token, catalog);
    if (!email) {
      return (
        <>
          <span className="mention-chip-lite__icon" aria-hidden="true">
            <EmailNavIcon size={14} />
          </span>
          <span className="mention-chip-lite__label">{label}</span>
        </>
      );
    }

    const dueDateLabel =
      email.dueDate != null ? formatTaskDueMetaLabel(email.dueDate) : null;

    return (
      <>
        <TaskPriorityIcon
          priority={email.priority}
          size={14}
          className="mention-chip-lite__meta-icon"
        />
        <span className="mention-chip-lite__icon" aria-hidden="true">
          <EmailNavIcon size={14} />
        </span>
        <span className="mention-chip-lite__id">{email.displayId}</span>
        <span className="mention-chip-lite__label mention-chip-lite__label--grow">
          {email.title || email.displayId}
        </span>
        {dueDateLabel ? (
          <span className="mention-chip-lite__due">
            <TaskDueDateIcon
              active
              urgency={getTaskDueDateUrgency(email.dueDate, new Date(), {
                status: email.status,
              })}
              size={12}
            />
            <span>{dueDateLabel}</span>
          </span>
        ) : null}
        {email.projectName ? (
          <span className="mention-chip-lite__project">
            <span>{email.projectName}</span>
          </span>
        ) : email.contactName ? (
          <span className="mention-chip-lite__project">
            <span>{email.contactName}</span>
          </span>
        ) : null}
      </>
    );
  }

  if (token.kind === "project") {
    const project = resolveMentionCatalogProject(token, catalog);
    if (!project) {
      return (
        <>
          <span className="mention-chip-lite__icon" aria-hidden="true">
            <MentionLeadingIcon kind="project" projectIcon={null} />
          </span>
          <span className="mention-chip-lite__label">{label}</span>
        </>
      );
    }

    return (
      <>
        <span className="mention-chip-lite__icon" aria-hidden="true">
          <ProjectOcticon
            icon={getDisplayProjectIcon(project.icon, project.type)}
            type={project.type}
            size={14}
          />
        </span>
        <span className="mention-chip-lite__id">{project.key}</span>
        <ProjectStatusIcon status={project.status} size={14} />
        <span className="mention-chip-lite__label mention-chip-lite__label--grow">
          {project.name}
        </span>
        {project.area ? (
          <span className="mention-chip-lite__area">
            {PROJECT_AREA_LABELS[project.area]}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <span className="mention-chip-lite__icon" aria-hidden="true">
        <MentionLeadingIcon
          kind={iconProps.kind}
          status={iconProps.status}
          projectIcon={iconProps.projectIcon}
          documentIcon={iconProps.documentIcon}
          contact={iconProps.contact}
        />
      </span>
      <span className="mention-chip-lite__label">{label}</span>
    </>
  );
}

function MentionChipLite({
  token,
  catalog,
  layout = "inline",
}: {
  token: ParsedMentionToken;
  catalog: MentionCatalog;
  layout?: MentionChipLayout;
}) {
  const { label, deleted } = resolvePreviewChipLabel(token, catalog);
  const chipLayout =
    token.kind === "task" ||
    token.kind === "project" ||
    token.kind === "letter" ||
    token.kind === "email"
      ? layout
      : "inline";
  const trailSourceHref = useMentionNavigationPathname();
  const href = deleted
    ? null
    : (trailSourceHref
        ? resolveMentionTrailHref(token, catalog, trailSourceHref)
        : null) ?? resolveMentionHref(token, catalog);

  // Shared block task card (documents @ mentions + email agent creates).
  if (
    !deleted &&
    chipLayout === "block" &&
    token.kind === "task" &&
    href
  ) {
    const task = resolveMentionCatalogTask(token, catalog);
    if (task) {
      const trigger = (
        <TaskMentionBlockChip
          task={task}
          href={href}
          titleAttr={token.raw}
        />
      );
      return (
        <MentionChipHoverShell
          trigger={trigger}
          layout="block"
          asChild
          hoverContent={
            <DocumentMentionHoverCard parsed={token} catalog={catalog} />
          }
        />
      );
    }
  }

  if (
    !deleted &&
    chipLayout === "block" &&
    token.kind === "email" &&
    href
  ) {
    const email = resolveMentionCatalogEmail(token, catalog);
    if (email) {
      const trigger = (
        <EmailMentionBlockChip
          email={email}
          href={href}
          titleAttr={token.raw}
        />
      );
      return (
        <MentionChipHoverShell
          trigger={trigger}
          layout="block"
          asChild
          hoverContent={
            <DocumentMentionHoverCard parsed={token} catalog={catalog} />
          }
        />
      );
    }
  }

  const chipClassName = [
    "mention-chip-lite",
    `mention-chip-lite--${token.kind}`,
    chipLayout === "block" ? "mention-chip-lite--block" : "",
    deleted ? "mention-chip-lite--deleted" : "",
    href ? "mention-chip-lite--link" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const chipBody = renderMentionChipBody(
    token,
    catalog,
    chipLayout,
    label,
    deleted,
  );

  const trigger = href ? (
    <ClientLink href={href} className={chipClassName} title={token.raw}>
      {chipBody}
    </ClientLink>
  ) : (
    <span className={chipClassName} title={token.raw}>
      {chipBody}
    </span>
  );

  return (
    <MentionChipHoverShell
      trigger={trigger}
      layout={chipLayout}
      asChild={Boolean(href)}
      hoverContent={
        <DocumentMentionHoverCard parsed={token} catalog={catalog} />
      }
    />
  );
}

function renderMentionChip(
  segment: Extract<MentionSegment, { type: "mention" }>,
  segments: MentionSegment[],
  segmentIndex: number,
  catalog: MentionCatalog,
  key: string,
) {
  const layout = resolveMentionLayout(segments, segmentIndex);

  return (
    <MentionChipLite
      key={key}
      token={segment.token}
      catalog={catalog}
      layout={layout}
    />
  );
}

function renderInlineSegment(
  segment: MentionSegment,
  segments: MentionSegment[],
  segmentIndex: number,
  catalog: MentionCatalog,
  key: string,
): ReactNode {
  if (segment.type === "mention") {
    return renderMentionChip(segment, segments, segmentIndex, catalog, key);
  }

  return <InlineMarkdownSegment key={key} content={segment.content} />;
}

function isWhitespaceOnlyMarkdown(segment: MentionSegment): boolean {
  return segment.type === "markdown" && segment.content.trim() === "";
}

/**
 * Consume one markdown list item (marker + same-line text/mentions) so chips
 * stay inline inside the `<li>` instead of breaking out after a ReactMarkdown list.
 */
function consumeListItem(
  segments: MentionSegment[],
  startIndex: number,
  catalog: MentionCatalog,
  keyPrefix: string,
): {
  leadingNewlines: string;
  ordered: boolean;
  item: ReactNode;
  nextIndex: number;
} | null {
  const start = segments[startIndex];
  if (start?.type !== "markdown") {
    return null;
  }

  const opener = matchListItemOpener(start.content);
  if (!opener) {
    return null;
  }

  const checkbox = parseMarkdownTaskCheckbox(opener.textAfterMarker);
  const textAfterMarker = checkbox?.textAfter ?? opener.textAfterMarker;

  const children: ReactNode[] = [];
  if (checkbox) {
    children.push(
      <MarkdownTaskCheckbox
        key={`${keyPrefix}-li-check-${startIndex}`}
        checked={checkbox.checked}
      />,
    );
  }

  const contentChildren: ReactNode[] = [];
  if (textAfterMarker) {
    contentChildren.push(
      <InlineMarkdownSegment
        key={`${keyPrefix}-li-text-${startIndex}`}
        content={textAfterMarker}
      />,
    );
  }

  let index = startIndex + 1;
  while (index < segments.length) {
    const segment = segments[index];
    if (!segment) {
      break;
    }

    if (segment.type === "mention") {
      contentChildren.push(
        <MentionChipLite
          key={`${keyPrefix}-li-mention-${index}`}
          token={segment.token}
          catalog={catalog}
          layout="inline"
        />,
      );
      index += 1;
      continue;
    }

    if (segment.content.startsWith("\n")) {
      break;
    }

    if (segment.content) {
      contentChildren.push(
        <span
          key={`${keyPrefix}-li-md-${index}`}
          className="content-markdown-preview-prewrap"
        >
          {segment.content}
        </span>,
      );
    }
    index += 1;
  }

  if (contentChildren.length > 0) {
    children.push(
      checkbox ? (
        <span
          key={`${keyPrefix}-li-content-${startIndex}`}
          className="md-task-checkbox__content"
        >
          {contentChildren}
        </span>
      ) : (
        contentChildren
      ),
    );
  }

  if (children.length === 0) {
    return null;
  }

  return {
    leadingNewlines: opener.leadingNewlines,
    ordered: opener.ordered,
    item: (
      <li
        key={`${keyPrefix}-li-${startIndex}`}
        className={checkbox ? "task-list-item" : undefined}
        data-checked={
          checkbox ? (checkbox.checked ? "true" : "false") : undefined
        }
      >
        {children}
      </li>
    ),
    nextIndex: index,
  };
}

function renderParagraphWithMentions(
  segments: MentionSegment[],
  catalog: MentionCatalog,
  keyPrefix: string,
): ReactNode[] {
  const elements: ReactNode[] = [];
  let inlineRun: ReactNode[] = [];
  let inlineRunKey = 0;
  let blockGroup: ReactNode[] = [];
  let blockGroupKey = 0;
  let index = 0;

  function flushBlockGroup() {
    if (blockGroup.length === 0) {
      return;
    }

    elements.push(
      <div
        key={`${keyPrefix}-block-group-${blockGroupKey}`}
        className="mention-task-stack"
      >
        {blockGroup}
      </div>,
    );
    blockGroup = [];
    blockGroupKey += 1;
  }

  function flushInlineRun() {
    if (inlineRun.length === 0) {
      return;
    }

    elements.push(
      <p key={`${keyPrefix}-inline-${inlineRunKey}`}>{inlineRun}</p>,
    );
    inlineRun = [];
    inlineRunKey += 1;
  }

  while (index < segments.length) {
    const listItems: ReactNode[] = [];
    let listOrdered: boolean | null = null;
    let listStart = index;

    while (index < segments.length) {
      const consumed = consumeListItem(segments, index, catalog, keyPrefix);
      if (!consumed) {
        break;
      }

      if (consumed.leadingNewlines) {
        // One `\n` is the normal next-line separator between list items in the
        // editor — keep a single <ul>/<ol>. Two+ newlines are a blank row.
        // Emitting a lone `\n` into a <p> creates the empty gap preview used to
        // show between mention chips in a list.
        if (listItems.length > 0) {
          if (
            !listItemLeadingNewlinesContinueList(consumed.leadingNewlines)
          ) {
            break;
          }
        } else if (
          !listItemLeadingNewlinesContinueList(consumed.leadingNewlines)
        ) {
          flushBlockGroup();
          inlineRun.push(
            <span
              key={`${keyPrefix}-ws-list-${index}`}
              className="content-markdown-preview-prewrap"
            >
              {consumed.leadingNewlines}
            </span>,
          );
        }
      }

      if (listOrdered == null) {
        listOrdered = consumed.ordered;
      } else if (listOrdered !== consumed.ordered) {
        break;
      }

      listItems.push(consumed.item);
      index = consumed.nextIndex;
    }

    if (listItems.length > 0) {
      flushInlineRun();
      flushBlockGroup();
      const ListTag = listOrdered ? "ol" : "ul";
      elements.push(
        <ListTag
          key={`${keyPrefix}-list-${listStart}`}
          className="mention-structured-list mention-structured-list--inline"
        >
          {listItems}
        </ListTag>,
      );
      continue;
    }

    const segment = segments[index];
    if (!segment) {
      break;
    }

    if (isWhitespaceOnlyMarkdown(segment)) {
      if (segment.type === "markdown" && segment.content.includes("\n")) {
        inlineRun.push(
          <span
            key={`${keyPrefix}-ws-${index}`}
            className="content-markdown-preview-prewrap"
          >
            {segment.content}
          </span>,
        );
      }
      index += 1;
      continue;
    }

    if (
      segment.type === "mention" &&
      resolveMentionLayout(segments, index) === "block"
    ) {
      flushInlineRun();
      blockGroup.push(
        <div
          key={`${keyPrefix}-block-${index}`}
          className="mention-task-block"
        >
          <MentionChipLite
            key={`${keyPrefix}-block-mention-${index}`}
            token={segment.token}
            catalog={catalog}
            layout="block"
          />
        </div>,
      );
      index += 1;
      continue;
    }

    flushBlockGroup();

    // Headings/lists/code must not land inside the inline <p> run — that
    // produces invalid <p><h2>… nesting and hydration errors.
    if (segment.type === "markdown" && hasBlockMarkdown(segment.content)) {
      flushInlineRun();
      elements.push(
        <MarkdownBlockSegment
          key={`${keyPrefix}-block-md-${index}`}
          content={segment.content}
        />,
      );
      index += 1;
      continue;
    }

    inlineRun.push(
      renderInlineSegment(
        segment,
        segments,
        index,
        catalog,
        `${keyPrefix}-seg-${index}`,
      ),
    );
    index += 1;
  }

  flushBlockGroup();
  flushInlineRun();
  return elements;
}

function ParagraphPreview({
  paragraph,
  catalog,
  paragraphIndex,
}: {
  paragraph: string;
  catalog: MentionCatalog;
  paragraphIndex: number;
}) {
  const keyPrefix = `p-${paragraphIndex}`;

  if (paragraph.trim() === "") {
    return <BlankParagraph />;
  }

  const segments = segmentMarkdownWithMentions(paragraph);
  const hasMentions = segments.some((segment) => segment.type === "mention");

  if (!hasMentions) {
    if (hasBlockMarkdown(paragraph)) {
      return <MarkdownBlockSegment content={paragraph} />;
    }

    return (
      <p>
        <InlineMarkdownSegment content={paragraph} />
      </p>
    );
  }

  if (!hasBlockMarkdown(paragraph)) {
    return <>{renderParagraphWithMentions(segments, catalog, keyPrefix)}</>;
  }

  return (
    <div className="content-markdown-preview-mixed">
      {renderParagraphWithMentions(segments, catalog, keyPrefix)}
    </div>
  );
}

/**
 * Rendered markdown preview with mention chips and catalog-backed hover cards.
 * Soft line breaks and blank paragraphs match Next `DocumentMarkdownPreview`.
 */
export function DocumentMarkdownPreview({
  body,
  mentionCatalog,
  onChange,
  resolveImageSrc,
}: DocumentMarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const catalogFromContext = useMentionCatalogOptional()?.catalog;
  const catalog =
    mentionCatalog ?? catalogFromContext ?? EMPTY_MENTION_CATALOG;

  const segments = useMemo(
    () => segmentMarkdownWithMentions(body),
    [body],
  );
  const mentionTokens = useMemo(
    () =>
      segments.flatMap((segment) =>
        segment.type === "mention" ? [segment.token] : [],
      ),
    [segments],
  );
  useResolveMentionTokensInContent(mentionTokens);

  useContentPreviewLinkNavigation({ containerRef, body });

  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }

  const paragraphs = splitParagraphs(body);

  return (
    <MarkdownImageResolveContext.Provider value={resolveImageSrc ?? null}>
      <MarkdownTaskListInteractProvider body={body} onChange={onChange}>
        <div
          ref={containerRef}
          data-content-preview-links=""
          data-markdown-task-list-root=""
          tabIndex={-1}
          className="content-markdown-preview-body content-markdown-preview-body--rendered"
        >
          {paragraphs.map((paragraph, index) => (
            <ParagraphPreview
              key={`paragraph-${index}`}
              paragraph={paragraph}
              catalog={catalog}
              paragraphIndex={index}
            />
          ))}
        </div>
      </MarkdownTaskListInteractProvider>
    </MarkdownImageResolveContext.Provider>
  );
}
