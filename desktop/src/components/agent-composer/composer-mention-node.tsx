/**
 * Lexical DecoratorNode for @file mention chips.
 * Adapted from pingdotgg/t3code (MIT) ComposerMentionNode.
 */

import {
  $applyNodeReplacement,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import type { ReactElement } from "react";

import { basenameOfPath, serializeComposerFileLink } from "./composer-mentions";

export type SerializedComposerMentionNode = Spread<
  {
    path: string;
    type: "composer-mention";
    version: 1;
  },
  SerializedLexicalNode
>;

function FileGlyph() {
  return (
    <svg
      className="desktop-agent-chat__mention-chip-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M4 2.5h5.2L12 5.3V13.5H4V2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 2.5V5.3H12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ComposerMentionDecorator({ path }: { path: string }) {
  return (
    <span
      className="desktop-agent-chat__mention-chip"
      contentEditable={false}
      spellCheck={false}
      data-composer-mention-chip="true"
      title={path}
    >
      <FileGlyph />
      <span className="desktop-agent-chat__mention-chip-label">
        {basenameOfPath(path)}
      </span>
    </span>
  );
}

export class ComposerMentionNode extends DecoratorNode<ReactElement> {
  __path: string;

  static getType(): string {
    return "composer-mention";
  }

  static clone(node: ComposerMentionNode): ComposerMentionNode {
    return new ComposerMentionNode(node.__path, node.__key);
  }

  static importJSON(
    serializedNode: SerializedComposerMentionNode,
  ): ComposerMentionNode {
    return $createComposerMentionNode(serializedNode.path);
  }

  constructor(path: string, key?: NodeKey) {
    super(key);
    this.__path = path;
  }

  exportJSON(): SerializedComposerMentionNode {
    return {
      ...super.exportJSON(),
      path: this.__path,
      type: "composer-mention",
      version: 1,
    };
  }

  createDOM(): HTMLElement {
    const dom = document.createElement("span");
    dom.className = "desktop-agent-chat__mention-node";
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  getTextContent(): string {
    return serializeComposerFileLink(this.__path);
  }

  isInline(): true {
    return true;
  }

  decorate(): ReactElement {
    return <ComposerMentionDecorator path={this.__path} />;
  }
}

export function $createComposerMentionNode(path: string): ComposerMentionNode {
  return $applyNodeReplacement(new ComposerMentionNode(path));
}

export function $isComposerMentionNode(
  node: unknown,
): node is ComposerMentionNode {
  return node instanceof ComposerMentionNode;
}
