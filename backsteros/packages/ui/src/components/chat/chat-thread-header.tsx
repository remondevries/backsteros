"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import { ProjectOcticon } from "../projects/project-octicon.js";

type ChatThreadPeerBase = {
  /** Stable id used for focus + per-peer thread state. */
  id: string;
  name: string;
  /** Optional line under the name (e.g. “contact info”). */
  subtitle?: string | null;
};

/** Who the thread is with — a person or a project space. */
export type ChatThreadPeer =
  | (ChatThreadPeerBase & {
      kind: "contact";
      avatarSrc?: string | null;
    })
  | (ChatThreadPeerBase & {
      kind: "project";
      /** Custom project icon key / emoji payload. */
      icon?: string | null;
      type?: string | null;
    });

const PEER_AVATAR_SIZE = 52;
/** Approximate peer column width used for edge centering padding. */
const PEER_SLOT_WIDTH = 92;
/** Distance (px) from center where peer spotlight falls to dim. */
const SPOTLIGHT_FALLOFF_PX = 110;

type ScrollAnimation = {
  cancelled: boolean;
  frame: number;
};

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Always-animated horizontal scroll (ignores prefers-reduced-motion / CSS
 * scroll-behavior). Duration scales with distance for a reel / slot feel.
 */
function animateScrollLeft(
  element: HTMLElement,
  to: number,
  onUpdate: () => void,
  animation: ScrollAnimation,
): void {
  const from = element.scrollLeft;
  const delta = to - from;
  if (Math.abs(delta) < 0.5) {
    element.scrollLeft = to;
    onUpdate();
    return;
  }

  const distance = Math.abs(delta);
  const duration = Math.min(920, Math.max(380, distance * 0.7));
  const start = performance.now();

  const tick = (now: number) => {
    if (animation.cancelled) return;
    const t = Math.min(1, (now - start) / duration);
    element.scrollLeft = from + delta * easeOutCubic(t);
    onUpdate();
    if (t < 1) {
      animation.frame = requestAnimationFrame(tick);
    }
  };

  animation.frame = requestAnimationFrame(tick);
}

function ChatThreadPeerAvatar({ peer }: { peer: ChatThreadPeer }) {
  if (peer.kind === "project") {
    return (
      <span className="chat-ui-thread__peer-avatar is-project" aria-hidden="true">
        <ProjectOcticon
          icon={peer.icon}
          type={peer.type}
          size={Math.round(PEER_AVATAR_SIZE * 0.48)}
        />
      </span>
    );
  }

  return (
    <span className="chat-ui-thread__peer-avatar is-contact" aria-hidden="true">
      <AssigneeListMark
        label={peer.name}
        avatarSrc={peer.avatarSrc}
        size={PEER_AVATAR_SIZE}
      />
    </span>
  );
}

export type ChatThreadActiveProject = {
  id: string;
  name: string;
};

export type ChatThreadHeaderProps = {
  peers: readonly ChatThreadPeer[];
  activePeerId: string | null;
  onSelectPeer?: (peerId: string) => void;
  /**
   * When set, fade in under the *active* agent name only (project room badge).
   * Hover reveals a leave control.
   */
  activeProject?: ChatThreadActiveProject | null;
  onLeaveProject?: () => void;
};

/**
 * iMessage-style peer chrome — centered avatar(s) with names underneath.
 * Switching peers animates the strip like a slot reel into center and lights
 * up the focused agent.
 */
export function ChatThreadHeader({
  peers,
  activePeerId,
  onSelectPeer,
  activeProject = null,
  onLeaveProject,
}: ChatThreadHeaderProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const peerRefs = useRef(new Map<string, HTMLElement>());
  const animationRef = useRef<ScrollAnimation | null>(null);
  const didInitialCenterRef = useRef(false);
  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(false);

  const setPeerRef = useCallback(
    (peerId: string, node: HTMLElement | null) => {
      if (node) peerRefs.current.set(peerId, node);
      else peerRefs.current.delete(peerId);
    },
    [],
  );

  const updateFades = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) {
      setFadeLeft(false);
      setFadeRight(false);
      return;
    }
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    setFadeLeft(scroller.scrollLeft > 2);
    setFadeRight(maxScroll > 2 && scroller.scrollLeft < maxScroll - 2);
  }, []);

  /** Dim peers by distance from the scrollport center (slot spotlight). */
  const updateSpotlight = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const centerX = scroller.scrollLeft + scroller.clientWidth / 2;
    for (const el of peerRefs.current.values()) {
      const peerCenter = el.offsetLeft + el.offsetWidth / 2;
      const distance = Math.abs(peerCenter - centerX);
      const spotlight = Math.max(0, 1 - distance / SPOTLIGHT_FALLOFF_PX);
      el.style.setProperty("--peer-spotlight", spotlight.toFixed(3));
    }
    updateFades();
  }, [updateFades]);

  const cancelAnimation = useCallback(() => {
    const current = animationRef.current;
    if (!current) return;
    current.cancelled = true;
    cancelAnimationFrame(current.frame);
    animationRef.current = null;
  }, []);

  const ensureEdgePadding = useCallback(() => {
    const scroller = scrollRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;
    const edgePad = Math.max(0, (scroller.clientWidth - PEER_SLOT_WIDTH) / 2);
    track.style.paddingInline = `${edgePad}px`;
  }, []);

  const targetScrollLeftForActive = useCallback((): number | null => {
    const scroller = scrollRef.current;
    const activeEl = activePeerId
      ? peerRefs.current.get(activePeerId)
      : null;
    if (!scroller || !activeEl) return null;
    return Math.max(
      0,
      activeEl.offsetLeft - (scroller.clientWidth - activeEl.offsetWidth) / 2,
    );
  }, [activePeerId]);

  const centerActivePeer = useCallback(
    (mode: "instant" | "reel") => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      ensureEdgePadding();
      const left = targetScrollLeftForActive();
      if (left == null) return;

      cancelAnimation();
      if (mode === "instant") {
        scroller.scrollLeft = left;
        updateSpotlight();
        return;
      }

      const animation: ScrollAnimation = { cancelled: false, frame: 0 };
      animationRef.current = animation;
      animateScrollLeft(scroller, left, updateSpotlight, animation);
    },
    [
      cancelAnimation,
      ensureEdgePadding,
      targetScrollLeftForActive,
      updateSpotlight,
    ],
  );

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    if (!didInitialCenterRef.current) {
      centerActivePeer("instant");
      didInitialCenterRef.current = true;
    }

    const onScroll = () => updateSpotlight();
    scroller.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => centerActivePeer("instant"))
        : null;
    resizeObserver?.observe(scroller);
    if (trackRef.current) resizeObserver?.observe(trackRef.current);

    return () => {
      scroller.removeEventListener("scroll", onScroll);
      resizeObserver?.disconnect();
      cancelAnimation();
    };
  }, [cancelAnimation, centerActivePeer, peers, updateSpotlight]);

  useLayoutEffect(() => {
    if (!didInitialCenterRef.current) return;
    centerActivePeer("reel");
  }, [activePeerId, centerActivePeer]);

  if (peers.length === 0) return null;

  return (
    <header className="chat-ui-thread__header">
      <div
        ref={scrollRef}
        className="chat-ui-thread__peers-scroll"
        data-fade-left={fadeLeft ? "true" : "false"}
        data-fade-right={fadeRight ? "true" : "false"}
      >
        <div
          ref={trackRef}
          className={[
            "chat-ui-thread__peers",
            peers.length > 1 ? "is-multi" : "is-single",
          ].join(" ")}
          role={peers.length > 1 ? "tablist" : undefined}
          aria-label={peers.length > 1 ? "Conversations" : undefined}
        >
          {peers.map((peer) => {
            const active = peer.id === activePeerId;
            const selectable = Boolean(onSelectPeer) && peers.length > 1;
            const subtitle = peer.subtitle?.trim() || null;
            const showProjectBadge =
              active && Boolean(activeProject?.name?.trim());
            const className = [
              "chat-ui-thread__peer",
              active ? "is-active" : "is-inactive",
              selectable ? "is-selectable" : "",
              showProjectBadge ? "has-project-badge" : "",
            ]
              .filter(Boolean)
              .join(" ");

            const projectBadge = showProjectBadge && activeProject ? (
              <span className="chat-ui-thread__project-badge">
                <span className="chat-ui-thread__project-badge-label">
                  {activeProject.name}
                </span>
                {onLeaveProject ? (
                  <button
                    type="button"
                    className="chat-ui-thread__project-badge-leave"
                    aria-label={`Leave ${activeProject.name}`}
                    title="Leave project"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onLeaveProject();
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ) : null;

            if (selectable) {
              return (
                <button
                  key={peer.id}
                  ref={(node) => setPeerRef(peer.id, node)}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={className}
                  onClick={() => onSelectPeer?.(peer.id)}
                >
                  <ChatThreadPeerAvatar peer={peer} />
                  <span className="chat-ui-thread__peer-name">{peer.name}</span>
                  {projectBadge}
                  {!showProjectBadge && subtitle ? (
                    <span className="chat-ui-thread__peer-subtitle">
                      {subtitle}
                    </span>
                  ) : null}
                </button>
              );
            }

            return (
              <div
                key={peer.id}
                ref={(node) => setPeerRef(peer.id, node)}
                className={className}
              >
                <ChatThreadPeerAvatar peer={peer} />
                <div className="chat-ui-thread__peer-name">{peer.name}</div>
                {projectBadge}
                {!showProjectBadge && subtitle ? (
                  <div className="chat-ui-thread__peer-subtitle">{subtitle}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
}
