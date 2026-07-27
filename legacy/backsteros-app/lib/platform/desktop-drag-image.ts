import { isTauriRuntime } from "@/lib/platform/runtime";

type DragImageEvent = {
  clientX: number;
  clientY: number;
  currentTarget: EventTarget | null;
  dataTransfer: DataTransfer | null;
};

/** WKWebView drag ghosts can pick up nearby sidebar layers; use a clean clone on desktop. */
export function applyDesktopDragImage(event: DragImageEvent): void {
  if (!isTauriRuntime() || !event.dataTransfer) {
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const clone = target.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.top = "-9999px";
  clone.style.left = "-9999px";
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.opacity = "1";
  clone.style.pointerEvents = "none";
  clone.style.margin = "0";
  clone.style.transform = "none";
  document.body.appendChild(clone);

  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  try {
    event.dataTransfer.setDragImage(clone, offsetX, offsetY);
  } finally {
    requestAnimationFrame(() => {
      clone.remove();
    });
  }
}
