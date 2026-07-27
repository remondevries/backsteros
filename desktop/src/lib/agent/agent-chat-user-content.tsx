import { DocumentMarkdownPreview } from "@backsteros/ui";

import {
  basenameOfPath,
  splitPromptIntoComposerSegments,
} from "../../components/agent-composer/composer-mentions";
import type { AgentChatImageAttachment } from "./agent-chat-transcript";
import { DesktopAgentFileIcon } from "../../components/desktop-agent-file-icon";
import { inferEntryKindFromPath } from "./pierre-icons";

/** Inline file chip for transcript user messages (T3 FileTagChip-style). */
export function AgentChatFileChip({ path }: { path: string }) {
  const label = basenameOfPath(path);
  return (
    <span className="desktop-agent-chat__file-chip" title={path}>
      <DesktopAgentFileIcon
        pathValue={path}
        kind={inferEntryKindFromPath(path)}
        className="desktop-agent-chat__file-chip-icon"
      />
      <span className="desktop-agent-chat__file-chip-label">{label}</span>
    </span>
  );
}

/**
 * T3 UserMessageBody: ChatMarkdown with lineBreaks, plus our file-mention chips.
 * Text segments render through DocumentMarkdownPreview (same as assistant).
 */
export function AgentChatUserMessageContent({
  text,
  images,
}: {
  text: string;
  images?: readonly AgentChatImageAttachment[];
}) {
  const segments = splitPromptIntoComposerSegments(text);
  const hasMentions = segments.some((segment) => segment.type === "mention");

  return (
    <div className="desktop-agent-chat__user-content">
      {images && images.length > 0 ? (
        <div className="desktop-agent-chat__user-images">
          {images.map((image) => (
            <figure key={image.id} className="desktop-agent-chat__user-image">
              {image.dataBase64 ? (
                <img
                  src={`data:${image.mimeType};base64,${image.dataBase64}`}
                  alt={image.name}
                />
              ) : (
                <figcaption>{image.name}</figcaption>
              )}
              <figcaption>{image.name}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {hasMentions ? (
        <div className="desktop-agent-chat__bubble-md desktop-agent-chat__bubble-md--user">
          {segments.map((segment, index) => {
            if (segment.type === "mention") {
              return <AgentChatFileChip key={`m-${index}`} path={segment.path} />;
            }
            if (!segment.text.trim()) {
              return (
                <span key={`t-${index}`} aria-hidden="true">
                  {segment.text}
                </span>
              );
            }
            return (
              <DocumentMarkdownPreview
                key={`t-${index}`}
                body={segment.text}
              />
            );
          })}
        </div>
      ) : text.trim() ? (
        <div className="desktop-agent-chat__bubble-md desktop-agent-chat__bubble-md--user">
          <DocumentMarkdownPreview body={text} />
        </div>
      ) : null}
    </div>
  );
}
