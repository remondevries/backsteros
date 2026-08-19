import confettiLib from "canvas-confetti";
import type { CreateTypes, Options } from "canvas-confetti";

const HABIT_COMPLETE_COLORS = ["#3d9a5b", "#5bc47a", "#9ae6b4", "#f7f9ff", "#86efac"];

let sharedFire: CreateTypes | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;

function resolveConfettiFn(): typeof confettiLib {
  const mod = confettiLib as unknown;
  if (typeof mod === "function") {
    return mod as typeof confettiLib;
  }
  if (
    mod &&
    typeof mod === "object" &&
    "default" in mod &&
    typeof (mod as { default: unknown }).default === "function"
  ) {
    return (mod as { default: typeof confettiLib }).default;
  }
  throw new Error("canvas-confetti is unavailable");
}

function getHabitConfettiFire(): CreateTypes {
  if (sharedFire && sharedCanvas?.isConnected) return sharedFire;

  if (typeof document === "undefined") {
    throw new Error("document unavailable");
  }

  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-habit-confetti-canvas", "");
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "10000";
  document.body.appendChild(canvas);

  const confetti = resolveConfettiFn();
  sharedCanvas = canvas;
  sharedFire = confetti.create(canvas, {
    resize: true,
    useWorker: true,
  });
  return sharedFire;
}

function originFromElement(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left + rect.width / 2) / window.innerWidth,
    y: (rect.top + rect.height / 2) / window.innerHeight,
  };
}

/**
 * Burst confetti from a habit control (day square or side-panel checkbox).
 * Uses a dedicated full-screen canvas so particles are never clipped by app
 * chrome. Origin is the element center — not a full-app / viewport center
 * celebration.
 */
export function fireHabitCompleteConfetti(
  originEl: Element,
  contentRoot: Element | null = null,
): void {
  if (typeof window === "undefined") return;

  const rect = originEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  if (contentRoot) {
    const rootRect = contentRoot.getBoundingClientRect();
    const visible =
      rect.bottom > rootRect.top &&
      rect.top < rootRect.bottom &&
      rect.right > rootRect.left &&
      rect.left < rootRect.right;
    if (!visible) return;
  }

  try {
    const fire = getHabitConfettiFire();
    const origin = originFromElement(originEl);
    const burst = (options: Options) => {
      void fire({
        ...options,
        origin,
        colors: HABIT_COMPLETE_COLORS,
        disableForReducedMotion: false,
      });
    };

    burst({
      particleCount: 36,
      spread: 58,
      startVelocity: 32,
      gravity: 0.95,
      scalar: 0.9,
      ticks: 140,
    });
    burst({
      particleCount: 24,
      spread: 90,
      startVelocity: 22,
      gravity: 1.1,
      scalar: 0.75,
      ticks: 120,
      decay: 0.9,
    });
  } catch {
    // Confetti is decorative — never block habit completion.
  }
}
