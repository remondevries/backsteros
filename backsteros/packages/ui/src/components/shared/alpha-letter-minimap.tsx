"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";

import {
  ALPHA_LETTER_MINIMAP_MIN_LETTERS,
  alphaLetterIndexFromPointer,
  alphaLetterMinimapHeightStyle,
  alphaLetterTopPercent,
} from "./alpha-letter-minimap-logic.js";

export type AlphaLetterMinimapProps = {
  /** Letters that have at least one row (e.g. from `groupItemsByAlphaLetter`). */
  letters: readonly string[];
  /** Scrollable list that contains `[data-type-group="{letter}"]` sections. */
  scrollRootRef: RefObject<HTMLElement | null>;
  /**
   * Called before scrolling so hosts can expand a collapsed letter section.
   * Return false to cancel the jump.
   */
  onBeforeSelect?: (letter: string) => boolean | void;
  /** Accessible name for the rail (e.g. "Jump to letter"). */
  ariaLabel?: string;
};

/**
 * Left-side letter scrubber for alpha-grouped catalogs (contacts / orgs).
 * Inspired by BacksterDEV’s timeline minimap: thin ticks that reveal the
 * letter on hover and scroll the matching section on click.
 */
export function AlphaLetterMinimap({
  letters,
  scrollRootRef,
  onBeforeSelect,
  ariaLabel = "Jump to letter",
}: AlphaLetterMinimapProps) {
  const labelId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [inViewLetter, setInViewLetter] = useState<string | null>(null);
  const pendingScrollRef = useRef<string | null>(null);

  const scrollToLetter = useCallback(
    (letter: string) => {
      const allowed = onBeforeSelect?.(letter);
      if (allowed === false) return;
      pendingScrollRef.current = letter;
      // Expand may need a paint before the section exists in the DOM.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (pendingScrollRef.current !== letter) return;
          pendingScrollRef.current = null;
          const root = scrollRootRef.current;
          if (!root) return;
          const target = root.querySelector<HTMLElement>(
            `[data-type-group="${CSS.escape(letter)}"]`,
          );
          target?.scrollIntoView({ block: "start", behavior: "smooth" });
        });
      });
    },
    [onBeforeSelect, scrollRootRef],
  );

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root || letters.length < ALPHA_LETTER_MINIMAP_MIN_LETTERS) return;

    const sections = letters
      .map((letter) =>
        root.querySelector<HTMLElement>(
          `[data-type-group="${CSS.escape(letter)}"]`,
        ),
      )
      .filter((node): node is HTMLElement => node != null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );
        const first = visible[0]?.target;
        if (!(first instanceof HTMLElement)) return;
        const letter = first.getAttribute("data-type-group");
        if (letter) setInViewLetter(letter);
      },
      {
        root,
        rootMargin: "-8% 0px -70% 0px",
        threshold: [0, 0.01, 0.1],
      },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [letters, scrollRootRef]);

  if (letters.length < ALPHA_LETTER_MINIMAP_MIN_LETTERS) return null;

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < letters.length ? activeIndex : null;
  const activeLetter =
    resolvedActiveIndex === null ? null : (letters[resolvedActiveIndex] ?? null);
  const activeTopPercent =
    resolvedActiveIndex === null
      ? 0
      : alphaLetterTopPercent(resolvedActiveIndex, letters.length);
  const activeTooltipTranslate =
    resolvedActiveIndex === null
      ? "-50%"
      : resolvedActiveIndex === 0
        ? "0%"
        : resolvedActiveIndex === letters.length - 1
          ? "-100%"
          : "-50%";

  const resolveIndexFromPointer = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return alphaLetterIndexFromPointer({
      letterCount: letters.length,
      railTop: rect.top,
      railHeight: rect.height,
      pointerY: event.clientY,
    });
  };

  return (
    <div
      className="alpha-letter-minimap"
      aria-labelledby={labelId}
      data-testid="alpha-letter-minimap"
    >
      <span id={labelId} className="alpha-letter-minimap__sr-only">
        {ariaLabel}
      </span>
      <div className="alpha-letter-minimap__rail">
        <button
          type="button"
          className="alpha-letter-minimap__hit"
          style={{ height: alphaLetterMinimapHeightStyle(letters.length) }}
          aria-label={
            activeLetter
              ? `Jump to letter ${activeLetter}`
              : ariaLabel
          }
          onBlur={() => setActiveIndex(null)}
          onMouseLeave={() => setActiveIndex(null)}
          onMouseMove={(event) => {
            setActiveIndex(resolveIndexFromPointer(event));
          }}
          onClick={(event) => {
            const nextIndex = resolveIndexFromPointer(event);
            const letter =
              nextIndex === null ? null : (letters[nextIndex] ?? null);
            if (letter) scrollToLetter(letter);
            event.currentTarget.blur();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) =>
                Math.min(letters.length - 1, (current ?? 0) + 1),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(0, (current ?? 0) - 1));
            } else if (event.key === "Home") {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === "End") {
              event.preventDefault();
              setActiveIndex(letters.length - 1);
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (activeLetter) scrollToLetter(activeLetter);
            }
          }}
          onFocus={() =>
            setActiveIndex((current) => {
              if (current != null) return current;
              const fromView = inViewLetter
                ? letters.indexOf(inViewLetter)
                : -1;
              return fromView >= 0 ? fromView : 0;
            })
          }
        >
          <span className="alpha-letter-minimap__line" aria-hidden="true" />
          {letters.map((letter, index) => {
            const activeDistance =
              resolvedActiveIndex === null
                ? null
                : Math.abs(index - resolvedActiveIndex);
            const inView = letter === inViewLetter;
            return (
              <span
                key={letter}
                aria-hidden="true"
                className={[
                  "alpha-letter-minimap__tick",
                  activeDistance === 0
                    ? "alpha-letter-minimap__tick--active"
                    : null,
                  activeDistance === 1
                    ? "alpha-letter-minimap__tick--near"
                    : null,
                  inView ? "alpha-letter-minimap__tick--in-view" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  top: `${alphaLetterTopPercent(index, letters.length)}%`,
                }}
              />
            );
          })}
          {activeLetter ? (
            <span
              className="alpha-letter-minimap__preview"
              aria-hidden="true"
              style={{
                top: `${activeTopPercent}%`,
                transform: `translateY(${activeTooltipTranslate})`,
              }}
            >
              {activeLetter}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
