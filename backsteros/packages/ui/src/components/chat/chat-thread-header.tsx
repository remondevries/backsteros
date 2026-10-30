"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { SidebarSettingsIcon } from "../shell/sidebar-nav-icons.js";
import { useMounted } from "../entity-actions/use-mounted.js";

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

/** Minimum slide so adjacent ⌥J/K steps still read as motion. */
const REEL_MIN_NUDGE_PX = 40;
const REEL_MIN_DURATION_MS = 560;
const REEL_MAX_DURATION_MS = 980;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Always-animated horizontal scroll (ignores prefers-reduced-motion / CSS
 * scroll-behavior). Duration scales with distance for a reel / slot feel, with
 * a floor so nearby peers (⌥J/K) never snap.
 */
function animateScrollLeft(
  element: HTMLElement,
  to: number,
  onUpdate: () => void,
  animation: ScrollAnimation,
  nudgeDirection: 1 | -1 = 1,
): void {
  const from = element.scrollLeft;
  let startLeft = from;
  let delta = to - from;

  if (Math.abs(delta) < REEL_MIN_NUDGE_PX) {
    const dir = Math.abs(delta) < 0.5 ? nudgeDirection : (Math.sign(delta) as 1 | -1);
    startLeft = to - dir * REEL_MIN_NUDGE_PX;
    element.scrollLeft = startLeft;
    delta = to - startLeft;
  }

  const duration = Math.min(
    REEL_MAX_DURATION_MS,
    Math.max(REEL_MIN_DURATION_MS, Math.abs(delta) * 0.9),
  );
  const start = performance.now();

  const tick = (now: number) => {
    if (animation.cancelled) return;
    const t = Math.min(1, (now - start) / duration);
    element.scrollLeft = startLeft + delta * easeOutCubic(t);
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
  icon?: string | null;
  type?: string | null;
};

export type ChatThreadHeaderProps = {
  peers: readonly ChatThreadPeer[];
  activePeerId: string | null;
  onSelectPeer?: (peerId: string) => void;
  /**
   * When set, hovering the active peer avatar reveals a gear that opens
   * “Delete messages” (multi-select mode).
   */
  onEnterSelectMode?: (() => void) | null;
};

/**
 * iMessage-style peer chrome — centered avatar(s) with names underneath.
 * Switching peers animates the strip like a slot reel into center and lights
 * up the focused agent. Switch projects or agents anytime from the strip.
 */
function ActivePeerGear({
  onEnterSelectMode,
}: {
  onEnterSelectMode: () => void;
}) {
  const menuId = useId();
  const mounted = useMounted();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelStyle({
      position: "fixed",
      top: `${rect.bottom + 6}px`,
      left: `${Math.max(8, rect.left + rect.width / 2 - 90)}px`,
      minWidth: "180px",
      visibility: "visible",
      zIndex: 1000,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const onPointer = (event: globalThis.MouseEvent) => {
      const target = event.target as Node | null;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [close, open]);

  return (
    <span className="chat-ui-thread__peer-gear-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="chat-ui-thread__peer-gear"
        aria-label="Chat settings"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <SidebarSettingsIcon size={14} />
      </button>
      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              id={menuId}
              role="menu"
              className="chat-ui-thread__peer-gear-menu"
              style={panelStyle}
            >
              <button
                type="button"
                role="menuitem"
                className="chat-ui-thread__peer-gear-item"
                onClick={() => {
                  close();
                  onEnterSelectMode();
                }}
              >
                Delete messages
              </button>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

export function ChatThreadHeader({
  peers,
  activePeerId,
  onSelectPeer,
  onEnterSelectMode = null,
}: ChatThreadHeaderProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const peerRefs = useRef(new Map<string, HTMLElement>());
  const animationRef = useRef<ScrollAnimation | null>(null);
  const didInitialCenterRef = useRef(false);
  const lastScrollTargetRef = useRef(0);
  const activePeerIdRef = useRef(activePeerId);
  activePeerIdRef.current = activePeerId;
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

  const targetScrollLeftForPeer = useCallback(
    (peerId: string | null): number | null => {
      const scroller = scrollRef.current;
      const activeEl = peerId ? peerRefs.current.get(peerId) : null;
      if (!scroller || !activeEl) return null;
      return Math.max(
        0,
        activeEl.offsetLeft - (scroller.clientWidth - activeEl.offsetWidth) / 2,
      );
    },
    [],
  );

  const centerActivePeer = useCallback(
    (mode: "instant" | "reel", peerId: string | null = activePeerIdRef.current) => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      ensureEdgePadding();
      const left = targetScrollLeftForPeer(peerId);
      if (left == null) return;

      cancelAnimation();
      if (mode === "instant") {
        scroller.scrollLeft = left;
        lastScrollTargetRef.current = left;
        updateSpotlight();
        return;
      }

      const nudgeDirection: 1 | -1 =
        left >= lastScrollTargetRef.current ? 1 : -1;
      lastScrollTargetRef.current = left;
      const animation: ScrollAnimation = { cancelled: false, frame: 0 };
      animationRef.current = animation;
      animateScrollLeft(
        scroller,
        left,
        updateSpotlight,
        animation,
        nudgeDirection,
      );
    },
    [cancelAnimation, ensureEdgePadding, targetScrollLeftForPeer, updateSpotlight],
  );

  const centerActivePeerRef = useRef(centerActivePeer);
  centerActivePeerRef.current = centerActivePeer;
  const updateSpotlightRef = useRef(updateSpotlight);
  updateSpotlightRef.current = updateSpotlight;

  // Mount / peer-list changes: listen once; keep handlers via refs so peer
  // switches do not rebind ResizeObserver (which was snapping the reel).
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    if (!didInitialCenterRef.current) {
      centerActivePeerRef.current("instant");
      didInitialCenterRef.current = true;
    } else {
      // Peer list changed (e.g. entered a project room) — keep active centered.
      centerActivePeerRef.current("instant");
    }

    const onScroll = () => updateSpotlightRef.current();
    scroller.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (animationRef.current) return;
            centerActivePeerRef.current("instant");
          })
        : null;
    resizeObserver?.observe(scroller);
    if (trackRef.current) resizeObserver?.observe(trackRef.current);

    return () => {
      scroller.removeEventListener("scroll", onScroll);
      resizeObserver?.disconnect();
      cancelAnimation();
    };
  }, [cancelAnimation, peers]);

  useLayoutEffect(() => {
    if (!didInitialCenterRef.current) return;
    centerActivePeer("reel", activePeerId);
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
            const showGear = active && typeof onEnterSelectMode === "function";
            const className = [
              "chat-ui-thread__peer",
              active ? "is-active" : "is-inactive",
              selectable ? "is-selectable" : "",
              showGear ? "has-gear" : "",
            ]
              .filter(Boolean)
              .join(" ");

            const avatarBlock = (
              <span className="chat-ui-thread__peer-avatar-wrap">
                <ChatThreadPeerAvatar peer={peer} />
                {showGear ? (
                  <ActivePeerGear onEnterSelectMode={onEnterSelectMode} />
                ) : null}
              </span>
            );

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
                  {avatarBlock}
                  <span className="chat-ui-thread__peer-name">{peer.name}</span>
                  {subtitle ? (
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
                {avatarBlock}
                <div className="chat-ui-thread__peer-name">{peer.name}</div>
                {subtitle ? (
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
