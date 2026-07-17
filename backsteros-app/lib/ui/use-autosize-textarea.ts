import { useCallback, useLayoutEffect, useRef } from "react";

type UseAutosizeTextareaOptions = {
  value: string;
  minHeight?: number;
  maxHeight?: number;
  enabled?: boolean;
};

export function useAutosizeTextarea({
  value,
  minHeight = 0,
  maxHeight,
  enabled = true,
}: UseAutosizeTextareaOptions) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }

    element.style.height = "auto";
    const scrollHeight = element.scrollHeight;
    let nextHeight = Math.max(scrollHeight, minHeight);

    if (maxHeight !== undefined) {
      nextHeight = Math.min(nextHeight, maxHeight);
      element.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
    } else {
      element.style.overflowY = "hidden";
    }

    element.style.height = `${nextHeight}px`;
  }, [maxHeight, minHeight]);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    resize();
  }, [enabled, resize, value]);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [enabled, resize]);

  return { textareaRef, resize };
}
