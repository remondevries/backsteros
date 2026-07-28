/**
 * FLIP dock for the draft-hero composer (T3 useDraftHeroLayoutTransition).
 * When leaving centered hero for the bottom overlay, animate the group from
 * the previous composer rect to the new layout position.
 */
import { useLayoutEffect, useRef } from "react";

export const DRAFT_HERO_TRANSITION_ANIMATION_ID =
  "desktop-draft-hero-transition";
export const DRAFT_HERO_TRANSITION_DURATION_MS = 280;
export const DRAFT_HERO_TRANSITION_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

export function useDraftHeroLayoutTransition(isDraftHeroState: boolean) {
  const transitionGroupRef = useRef<HTMLDivElement | null>(null);
  const composerAnchorRef = useRef<HTMLDivElement | null>(null);
  const previousStateRef = useRef(isDraftHeroState);
  const previousComposerRectRef = useRef<DOMRect | null>(null);
  const animationRef = useRef<Animation | null>(null);

  const attachTransitionGroupRef = (element: HTMLDivElement | null) => {
    transitionGroupRef.current = element;
  };

  const attachComposerAnchorRef = (element: HTMLDivElement | null) => {
    composerAnchorRef.current = element;
  };

  useLayoutEffect(() => {
    const transitionGroup = transitionGroupRef.current;
    const nextComposerRect =
      composerAnchorRef.current?.getBoundingClientRect() ?? null;
    const stateChanged = previousStateRef.current !== isDraftHeroState;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    animationRef.current?.cancel();
    animationRef.current = null;

    const previousComposerRect = previousComposerRectRef.current;
    if (
      stateChanged &&
      !prefersReducedMotion &&
      transitionGroup &&
      previousComposerRect &&
      nextComposerRect &&
      typeof transitionGroup.animate === "function"
    ) {
      const translateX = previousComposerRect.left - nextComposerRect.left;
      const translateY = previousComposerRect.top - nextComposerRect.top;
      if (Math.abs(translateX) >= 0.5 || Math.abs(translateY) >= 0.5) {
        const animation = transitionGroup.animate(
          [
            { transform: `translate3d(${translateX}px, ${translateY}px, 0)` },
            { transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: DRAFT_HERO_TRANSITION_DURATION_MS,
            easing: DRAFT_HERO_TRANSITION_EASING,
          },
        );
        animation.id = DRAFT_HERO_TRANSITION_ANIMATION_ID;
        animationRef.current = animation;
        void animation.finished
          .catch(() => undefined)
          .then(() => {
            if (animationRef.current !== animation) return;
            animationRef.current = null;
          });
      }
    }

    previousStateRef.current = isDraftHeroState;
    previousComposerRectRef.current = nextComposerRect;
  }, [isDraftHeroState]);

  return [attachTransitionGroupRef, attachComposerAnchorRef] as const;
}
