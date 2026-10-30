"use client";

import { useId, type ReactNode } from "react";

import {
  chatChannelKindLabel,
  resolveChatChannelKind,
  type ChatChannelKind,
  type ResolveChatChannelKindOptions,
} from "../../communication/chat-channel-kind.js";
import { InboxItemTypeIcon } from "../inbox/inbox-item-type-icon.js";

/** Idle chat kind — solid bubble (generic web / API). */
export function CommunicationChatKindIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M11.953 2.25c-2.317 0-4.118 0-5.52.15-1.418.153-2.541.47-3.437 1.186-.92.736-1.35 1.693-1.553 2.9-.193 1.152-.193 2.618-.193 4.446v.183c0 1.782 0 3.015.2 3.934.108.495.278.925.545 1.323.264.392.6.722 1.001 1.042.631.505 1.375.81 2.254 1V21a.75.75 0 0 0 1.123.65c.586-.335 1.105-.7 1.58-1.044l.304-.221a22 22 0 0 1 1.036-.73c.844-.548 1.65-.905 2.707-.905h.047c2.317 0 4.118 0 5.52-.15 1.418-.153 2.541-.47 3.437-1.186.4-.32.737-.65 1-1.042.268-.398.438-.828.546-1.323.2-.919.2-2.152.2-3.934v-.183c0-1.828 0-3.294-.193-4.445-.203-1.208-.633-2.165-1.553-2.901-.896-.717-2.019-1.033-3.437-1.185-1.402-.151-3.203-.151-5.52-.151z" />
    </svg>
  );
}

/** Telegram mark (disc + plane) for list kind badges. */
export function CommunicationTelegramKindIcon({
  size = 15,
}: {
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <title>Telegram</title>
      <path
        fill="#000"
        d="M11.944 3.26667e-05C8.77112 0.0148396 5.73324 1.28566 3.4949 3.53449C1.25656 5.78332 -3.4549e-05 8.82711 7.12435e-10 12C7.12441e-10 15.1826 1.26428 18.2349 3.51472 20.4853C5.76515 22.7358 8.8174 24 12 24C15.1826 24 18.2348 22.7358 20.4853 20.4853C22.7357 18.2349 24 15.1826 24 12C24 8.81743 22.7357 5.76519 20.4853 3.51475C18.2348 1.26431 15.1826 3.26667e-05 12 3.26667e-05C11.9813 -1.08889e-05 11.9627 -1.08889e-05 11.944 3.26667e-05ZM16.906 7.22403C17.006 7.22203 17.227 7.24703 17.371 7.36403C17.4667 7.44713 17.5277 7.56311 17.542 7.68903C17.558 7.78203 17.578 7.99503 17.562 8.16103C17.382 10.059 16.6 14.663 16.202 16.788C16.034 17.688 15.703 17.989 15.382 18.018C14.686 18.083 14.157 17.558 13.482 17.116C12.426 16.423 11.829 15.992 10.804 15.316C9.619 14.536 10.387 14.106 11.062 13.406C11.239 13.222 14.309 10.429 14.369 10.176C14.376 10.144 14.383 10.026 14.313 9.96403C14.243 9.90203 14.139 9.92303 14.064 9.94003C13.958 9.96403 12.271 11.08 9.003 13.285C8.523 13.615 8.09 13.775 7.701 13.765C7.273 13.757 6.449 13.524 5.836 13.325C5.084 13.08 4.487 12.951 4.539 12.536C4.566 12.32 4.864 12.099 5.432 11.873C8.93 10.349 11.262 9.34403 12.43 8.85903C15.762 7.47303 16.455 7.23203 16.906 7.22403Z"
      />
      <path
        fill="#FFF"
        d="M16.906 7.22403C17.006 7.22203 17.227 7.24703 17.371 7.36403C17.4667 7.44713 17.5277 7.56311 17.542 7.68903C17.558 7.78203 17.578 7.99503 17.562 8.16103C17.382 10.059 16.6 14.663 16.202 16.788C16.034 17.688 15.703 17.989 15.382 18.018C14.686 18.083 14.157 17.558 13.482 17.116C12.426 16.423 11.829 15.992 10.804 15.316C9.619 14.536 10.387 14.106 11.062 13.406C11.239 13.222 14.309 10.429 14.369 10.176C14.376 10.144 14.383 10.026 14.313 9.96403C14.243 9.90203 14.139 9.92303 14.064 9.94003C13.958 9.96403 12.271 11.08 9.003 13.285C8.523 13.615 8.09 13.775 7.701 13.765C7.273 13.757 6.449 13.524 5.836 13.325C5.084 13.08 4.487 12.951 4.539 12.536C4.566 12.32 4.864 12.099 5.432 11.873C8.93 10.349 11.262 9.34403 12.43 8.85903C15.762 7.47303 16.455 7.23203 16.906 7.22403Z"
      />
    </svg>
  );
}

/** Instagram brand mark (pink disc + white glyph) for list kind badges. */
export function CommunicationInstagramKindIcon({
  size = 15,
}: {
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <title>Instagram</title>
      <circle cx="512" cy="512" r="512" fill="#ff0069" />
      <path
        fill="#fff"
        d="M512 256c-69.55 0-78.23.32-105.54 1.54s-45.82 5.57-62.14 11.9a130.83 130.83 0 0 0-74.88 74.88c-6.34 16.32-10.65 34.88-11.9 62.14S256 442.45 256 512s.32 78.23 1.54 105.54 5.57 45.82 11.9 62.14a130.83 130.83 0 0 0 74.88 74.88c16.34 6.31 34.9 10.65 62.14 11.9S442.45 768 512 768s78.23-.32 105.54-1.54 45.82-5.59 62.14-11.9a130.83 130.83 0 0 0 74.88-74.88c6.31-16.32 10.65-34.9 11.9-62.14S768 581.55 768 512s-.32-78.23-1.54-105.54-5.59-45.85-11.9-62.14a130.83 130.83 0 0 0-74.88-74.88c-16.32-6.34-34.9-10.65-62.14-11.9S581.55 256 512 256Zm0 46.08c68.33 0 76.48.34 103.47 1.51 25 1.17 38.51 5.31 47.51 8.85A84.24 84.24 0 0 1 711.57 361c3.5 9 7.68 22.55 8.81 47.51 1.22 27 1.49 35.11 1.49 103.47s-.32 76.48-1.58 103.47c-1.3 25-5.46 38.51-9 47.51-4.78 12-10.22 20.48-19.18 29.48a79.87 79.87 0 0 1-29.44 19.11c-9 3.5-22.72 7.68-47.68 8.81-27.18 1.22-35.18 1.49-103.66 1.49s-76.5-.32-103.66-1.58c-25-1.3-38.74-5.46-47.7-9-12.14-4.78-20.48-10.22-29.42-19.18a77.73 77.73 0 0 1-19.2-29.44c-3.52-9-7.66-22.72-9-47.68-1-26.88-1.3-35.18-1.3-103.34s.34-76.5 1.3-103.7c1.3-25 5.44-38.7 9-47.66 4.48-12.16 10.22-20.48 19.2-29.46s17.28-14.7 29.42-19.16c9-3.54 22.42-7.7 47.38-9 27.2-1 35.2-1.28 103.66-1.28Zm0 78.46A131.46 131.46 0 1 0 643.46 512 131.45 131.45 0 0 0 512 380.54Zm0 216.79A85.33 85.33 0 1 1 597.33 512 85.31 85.31 0 0 1 512 597.33Zm167.38-222a30.72 30.72 0 1 1-30.72-30.7 30.74 30.74 0 0 1 30.72 30.73Z"
      />
    </svg>
  );
}

/** Facebook Messenger brand mark for list kind badges. */
export function CommunicationMessengerKindIcon({
  size = 15,
}: {
  size?: number;
}) {
  const gradientId = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <title>Messenger</title>
      <defs>
        <radialGradient
          id={gradientId}
          cx="19.247%"
          cy="99.465%"
          r="108.96%"
          fx="19.247%"
          fy="99.465%"
        >
          <stop offset="0%" stopColor="#09F" />
          <stop offset="60.975%" stopColor="#A033FF" />
          <stop offset="93.482%" stopColor="#FF5280" />
          <stop offset="100%" stopColor="#FF7061" />
        </radialGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M128 0C55.894 0 0 52.818 0 124.16c0 37.317 15.293 69.562 40.2 91.835 2.09 1.871 3.352 4.493 3.438 7.298l.697 22.77c.223 7.262 7.724 11.988 14.37 9.054L84.111 243.9a10.218 10.218 0 0 1 6.837-.501c11.675 3.21 24.1 4.92 37.052 4.92 72.106 0 128-52.818 128-124.16S200.106 0 128 0Z"
      />
      <path
        fill="#FFF"
        d="m51.137 160.47 37.6-59.653c5.98-9.49 18.788-11.853 27.762-5.123l29.905 22.43a7.68 7.68 0 0 0 9.252-.027l40.388-30.652c5.39-4.091 12.428 2.36 8.82 8.085l-37.6 59.654c-5.981 9.489-18.79 11.852-27.763 5.122l-29.906-22.43a7.68 7.68 0 0 0-9.25.027l-40.39 30.652c-5.39 4.09-12.427-2.36-8.818-8.085Z"
      />
    </svg>
  );
}

/** X brand mark for list kind badges (black disc + white glyph baked in). */
export function CommunicationXKindIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
    >
      <title>X</title>
      <rect width="24" height="24" rx="12" fill="black" />
      <path
        d="M13.1415 11.081L17.6091 6H16.5503L12.6714 10.412L9.57333 6H6L10.6847 12.6715L6 18H7.05876L11.1548 13.341L14.4267 18H18L13.1415 11.081ZM11.6919 12.7305L11.2172 12.066L7.43996 6.78H9.06592L12.1139 11.046L12.5887 11.7105L16.5508 17.2555H14.9249L11.6919 12.7305Z"
        fill="white"
      />
    </svg>
  );
}

/** WhatsApp brand mark for list kind badges (white glyph on #25D366 disc). */
export function CommunicationWhatsAppKindIcon({
  size = 11,
}: {
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
    >
      <title>WhatsApp</title>
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
      />
    </svg>
  );
}

/** Support-ring glyph — same path as TaskStatusIcon (support). */
export function CommunicationSupportKindIcon({
  size = 11,
}: {
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 14 14"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.348 4.45055L10.1504 6.2827C10.2578 6.75577 10.2578 7.24689 10.1504 7.72001L12.348 9.55072C12.7265 8.75404 12.923 7.88305 12.923 7.00098C12.923 6.11893 12.7265 5.24723 12.348 4.45055ZM9.55022 12.3492L7.71807 10.1509C7.24496 10.2583 6.75384 10.2583 6.28076 10.1509L4.45005 12.3485C5.24673 12.727 6.11771 12.9234 6.99976 12.9234C7.88183 12.9234 8.75282 12.727 9.5495 12.3485L9.55022 12.3492ZM1.65157 9.55072L3.84986 7.71857C3.74243 7.24546 3.74243 6.75433 3.84986 6.28126L1.65229 4.45199C1.27372 5.24867 1.07731 6.11965 1.07731 7.0017C1.07731 7.88377 1.27372 8.75476 1.65229 9.55144L1.65157 9.55072ZM4.45005 1.65207L6.2822 3.85036C6.75527 3.74292 7.24639 3.74292 7.71951 3.85036L9.55022 1.65279C8.75354 1.27423 7.88255 1.07782 7.00048 1.07782C6.11843 1.07782 5.24745 1.27423 4.45076 1.65279L4.45005 1.65207ZM10.6652 1.03465C11.1317 1.32195 11.563 1.6629 11.9502 2.05052C12.3375 2.43735 12.6782 2.86816 12.9654 3.33417C13.6419 4.43706 14 5.70568 14 6.99955C14 8.29342 13.6419 9.56206 12.9654 10.6649C12.6781 11.1315 12.3371 11.5628 11.9495 11.95C11.5626 12.3373 11.1319 12.678 10.6659 12.9652C9.56285 13.6418 8.29413 14 7.00012 14C5.70612 14 4.43736 13.6418 3.33439 12.9652C2.86835 12.6778 2.43753 12.3369 2.05074 11.9493C1.66321 11.5625 1.32226 11.1317 1.03487 10.6657C0.358182 9.56264 0 8.29392 0 6.99991C0 5.70589 0.358182 4.43714 1.03487 3.33417C1.32226 2.86812 1.66319 2.4373 2.05074 2.05052C2.43753 1.66298 2.86834 1.32203 3.33439 1.03465C4.43728 0.358103 5.7059 0 6.99976 0C8.29363 0 9.56228 0.358103 10.6652 1.03465ZM8.52287 5.47862C8.29808 5.25303 8.02585 5.08036 7.72597 4.9732C7.25652 4.8061 6.74376 4.8061 6.2743 4.9732C5.97441 5.08036 5.70218 5.25303 5.4774 5.47862C5.24336 5.71195 5.07536 5.98476 4.97198 6.27552C4.80489 6.74497 4.80489 7.25774 4.97198 7.72719C5.07536 8.01795 5.24336 8.29076 5.4774 8.52409C5.71073 8.75813 5.98354 8.92613 6.2743 9.02951C6.74239 9.19678 7.25788 9.19678 7.72597 9.02951C8.02585 8.92232 8.29808 8.74966 8.52287 8.52409C8.75691 8.29076 8.9249 8.01795 9.02829 7.72719C9.19528 7.25766 9.19528 6.74499 9.02829 6.27552C8.9211 5.97563 8.74844 5.7034 8.52287 5.47862Z"
      />
    </svg>
  );
}

/** Kind badge glyph for a Chatwoot channel type. */
export function CommunicationChannelKindIcon({
  channelType,
  inboxName,
  contactName,
  size,
}: {
  channelType?: string | null;
  inboxName?: string | null;
  contactName?: string | null;
  size?: number;
}) {
  const kind = resolveChatChannelKind(channelType, { inboxName, contactName });
  const brandSize = size ?? 15;
  const bubbleSize = size ?? 11;
  if (kind === "whatsapp") {
    // Glyph sits inside the CSS green disc (unlike Telegram’s self-colored SVG).
    return <CommunicationWhatsAppKindIcon size={bubbleSize} />;
  }
  if (kind === "x") {
    return <CommunicationXKindIcon size={brandSize} />;
  }
  if (kind === "telegram") {
    return <CommunicationTelegramKindIcon size={brandSize} />;
  }
  if (kind === "instagram") {
    return <CommunicationInstagramKindIcon size={brandSize} />;
  }
  if (kind === "messenger") {
    return <CommunicationMessengerKindIcon size={brandSize} />;
  }
  if (kind === "support") {
    return <CommunicationSupportKindIcon size={bubbleSize} />;
  }
  return <CommunicationChatKindIcon size={bubbleSize} />;
}

/**
 * Platform mark for message mention / chat chips — WhatsApp, Telegram,
 * Instagram, Messenger, X, Support, or generic chat — with disc chrome.
 */
export function MentionMessageChannelIcon({
  channelType,
  inboxName,
  contactName,
  size = 14,
}: {
  channelType?: string | null;
  inboxName?: string | null;
  contactName?: string | null;
  size?: number;
}) {
  const kindClass = communicationChannelKindClass(channelType, {
    inboxName,
    contactName,
  });
  // Brand SVGs (Telegram / Instagram / …) include their own disc; WhatsApp /
  // support / generic chat glyphs need the colored wrapper.
  const glyphSize =
    kindClass.includes("whatsapp") ||
    kindClass.includes("support") ||
    kindClass.endsWith("--chat")
      ? Math.max(9, Math.round(size * 0.72))
      : size;
  return (
    <span
      className={`mention-chip-lite__channel-kind ${kindClass}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <CommunicationChannelKindIcon
        channelType={channelType}
        inboxName={inboxName}
        contactName={contactName}
        size={glyphSize}
      />
    </span>
  );
}

export function communicationChannelKindClass(
  channelType?: string | null,
  options?: ResolveChatChannelKindOptions,
): string {
  const kind = resolveChatChannelKind(channelType, options);
  if (kind === "whatsapp") return "communication-chat__card-kind--whatsapp";
  if (kind === "x") return "communication-chat__card-kind--x";
  if (kind === "telegram") return "communication-chat__card-kind--telegram";
  if (kind === "instagram") return "communication-chat__card-kind--instagram";
  if (kind === "messenger") return "communication-chat__card-kind--messenger";
  if (kind === "support") return "communication-chat__card-kind--support";
  return "communication-chat__card-kind--chat";
}

export function communicationChannelKindTitle(
  channelType?: string | null,
  typingOrOptions: boolean | ResolveChatChannelKindOptions = false,
  options?: ResolveChatChannelKindOptions,
): string {
  const typing =
    typeof typingOrOptions === "boolean" ? typingOrOptions : false;
  const resolveOptions =
    typeof typingOrOptions === "boolean" ? options : typingOrOptions;
  if (typing) return "Typing…";
  return chatChannelKindLabel(
    resolveChatChannelKind(channelType, resolveOptions),
  );
}

export type CommunicationKind =
  | "email"
  | "support"
  | "chat"
  | "telegram"
  | "instagram"
  | "messenger"
  | "whatsapp"
  | "x";

/**
 * Colored disc + glyph matching Communication list card kind badges.
 */
export function CommunicationKindMark({
  kind,
  className,
  iconSize = 11,
}: {
  kind: CommunicationKind;
  className?: string;
  iconSize?: number;
}): ReactNode {
  // Email glyph is slightly smaller on list cards (fits the envelope in the disc).
  // Brand logos include their own disc, so they fill the 15px badge.
  const emailSize = Math.max(9, iconSize - 2);
  const brandSize = Math.max(iconSize, 15);
  const channelKind: ChatChannelKind | null =
    kind === "telegram" ||
    kind === "instagram" ||
    kind === "messenger" ||
    kind === "whatsapp" ||
    kind === "x" ||
    kind === "chat"
      ? kind
      : null;
  const glyph =
    kind === "email" ? (
      <InboxItemTypeIcon kind="email" size={emailSize} />
    ) : kind === "support" ? (
      <CommunicationSupportKindIcon size={iconSize} />
    ) : kind === "whatsapp" ? (
      <CommunicationWhatsAppKindIcon size={iconSize} />
    ) : kind === "x" ? (
      <CommunicationXKindIcon size={brandSize} />
    ) : kind === "telegram" ? (
      <CommunicationTelegramKindIcon size={brandSize} />
    ) : kind === "instagram" ? (
      <CommunicationInstagramKindIcon size={brandSize} />
    ) : kind === "messenger" ? (
      <CommunicationMessengerKindIcon size={brandSize} />
    ) : (
      <CommunicationChatKindIcon size={iconSize} />
    );

  const kindClass =
    channelKind === "whatsapp"
      ? "communication-chat__card-kind--whatsapp"
      : channelKind === "x"
        ? "communication-chat__card-kind--x"
        : channelKind === "telegram"
          ? "communication-chat__card-kind--telegram"
          : channelKind === "instagram"
            ? "communication-chat__card-kind--instagram"
            : channelKind === "messenger"
              ? "communication-chat__card-kind--messenger"
              : `communication-chat__card-kind--${kind}`;

  return (
    <span
      className={["communication-chat__card-kind", kindClass, className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      {glyph}
    </span>
  );
}
