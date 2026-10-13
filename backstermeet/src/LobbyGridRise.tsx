import { useEffect, useRef } from "react";

type Theme = "dark" | "light";

type LobbyGridRiseProps = {
  theme: Theme;
  paused?: boolean;
  className?: string;
};

type FaceColors = { top: string; left: string; right: string };

/**
 * Canvas approximation of React Bits Pro "Grid Rise".
 * Dark: color/bg #0e0000, accent #e97b35 @ 0.85, relief 0, cell 0.06
 * Light: color/bg #e4e3da, accent #000000 @ 0, relief 0.18, cell 0.056
 */
const GRID = {
  dark: {
    bg: "#0e0000",
    top: "#0e0000",
    accent: "#e97b35",
    accentStrength: 0.85,
    relief: 0,
    cellSize: 0.06,
    haze: "rgba(14,0,0,0.7)",
  },
  light: {
    bg: "#e4e3da",
    top: "#e4e3da",
    accent: "#000000",
    accentStrength: 0,
    relief: 0.18,
    cellSize: 0.056,
    haze: "rgba(228,227,218,0.55)",
  },
  gap: 0.23,
  lift: 0.06,
  zoom: 2.9,
  altitude: 1,
  dpr: 1,
  ease: 0.1,
  rounding: 0.1,
  liftRadius: 0.6,
  orbit: 45,
  haze: 1,
  maxFps: 60,
  amplitude: 0.05,
  speed: 0.6,
  distance: 1.5,
  drift: 0.12,
} as const;

function parseColor(color: string): [number, number, number] {
  if (color.startsWith("#")) {
    const h = color.slice(1);
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ];
  }
  const match = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) {
    return [
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10),
      Number.parseInt(match[3], 10),
    ];
  }
  return [0, 0, 0];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseColor(a);
  const [br, bg, bb] = parseColor(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(ar + (br - ar) * k)},${Math.round(ag + (bg - ag) * k)},${Math.round(ab + (bb - ab) * k)})`;
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = parseColor(hex);
  const f = Math.max(0, 1 - amount);
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

export function LobbyGridRise({
  theme,
  paused = false,
  className,
}: LobbyGridRiseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(theme);
  const pausedRef = useRef(paused);

  useEffect(() => {
    themeRef.current = theme;
    pausedRef.current = paused;
  }, [theme, paused]);

  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!canvasNode) return;
    const ctxMaybe = canvasNode.getContext("2d", { alpha: false });
    if (!ctxMaybe) return;
    const canvasEl: HTMLCanvasElement = canvasNode;
    const context: CanvasRenderingContext2D = ctxMaybe;

    let raf = 0;
    let elapsed = 0;
    let last = performance.now();
    let focusCol = 0.42;
    let focusRow = 0.4;
    let targetCol = focusCol;
    let targetRow = focusRow;

    function themeConfig() {
      return themeRef.current === "light" ? GRID.light : GRID.dark;
    }

    function palette() {
      const mode = themeConfig();
      const top = mode.top;
      return {
        bg: mode.bg,
        top,
        left: shade(top, 0.1 + mode.relief * 0.35),
        right: shade(top, 0.16 + mode.relief * 0.45),
        accent: mode.accent,
        accentStrength: mode.accentStrength,
        haze: mode.haze,
        cellSize: mode.cellSize,
      };
    }

    function resize() {
      const parent = canvasEl.parentElement;
      const cssW = Math.max(
        1,
        canvasEl.clientWidth || parent?.clientWidth || window.innerWidth || 1,
      );
      const cssH = Math.max(
        1,
        canvasEl.clientHeight || parent?.clientHeight || window.innerHeight || 1,
      );
      const dpr = Math.min(window.devicePixelRatio || 1, GRID.dpr);
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));
      if (canvasEl.width !== w || canvasEl.height !== h) {
        canvasEl.width = w;
        canvasEl.height = h;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: cssW, h: cssH };
    }

    function drawPrism(
      x: number,
      y: number,
      halfW: number,
      halfH: number,
      liftPx: number,
      colors: FaceColors,
      round: number,
    ) {
      const topY = y - liftPx;
      const inset = halfW * round * 0.35;

      context.beginPath();
      context.moveTo(x + halfW, topY);
      context.lineTo(x, topY + halfH);
      context.lineTo(x, y + halfH);
      context.lineTo(x + halfW, y);
      context.closePath();
      context.fillStyle = colors.right;
      context.fill();

      context.beginPath();
      context.moveTo(x - halfW, topY);
      context.lineTo(x, topY + halfH);
      context.lineTo(x, y + halfH);
      context.lineTo(x - halfW, y);
      context.closePath();
      context.fillStyle = colors.left;
      context.fill();

      context.beginPath();
      context.moveTo(x, topY - halfH + inset * 0.2);
      context.lineTo(x + halfW - inset * 0.15, topY);
      context.lineTo(x, topY + halfH - inset * 0.2);
      context.lineTo(x - halfW + inset * 0.15, topY);
      context.closePath();
      context.fillStyle = colors.top;
      context.fill();
    }

    function paint(w: number, h: number, t: number) {
      const colors = palette();
      context.fillStyle = colors.bg;
      context.fillRect(0, 0, w, h);

      const worldScale = (Math.min(w, h) * colors.cellSize) / GRID.distance;
      const cell = Math.max(22, worldScale * GRID.zoom * 0.55);
      const drawScale = 1 - GRID.gap;
      const halfW = cell * 0.5 * drawScale;
      const halfH = cell * (0.29 / (GRID.zoom / 2.9)) * drawScale;
      const stepX = cell;
      const stepY = cell * (0.5 * (GRID.orbit / 45));

      const cols = Math.ceil(w / stepX) + 12;
      const rows = Math.ceil(h / stepY) + 14;

      const drift = GRID.drift;
      targetCol = 0.42 + drift * Math.cos(t * 0.35);
      targetRow = 0.4 + drift * Math.sin(t * 0.28);
      focusCol += (targetCol - focusCol) * GRID.ease;
      focusRow += (targetRow - focusRow) * GRID.ease;

      const focusC = (cols - 1) * focusCol;
      const focusR = (rows - 1) * focusRow;
      const originX = w * 0.38;
      const originY = h * (0.02 + (1 - GRID.altitude) * 0.08);

      const radiusCells = GRID.liftRadius / colors.cellSize;
      const liftPxBase = cell * GRID.lift * 16;
      const ampPx = cell * GRID.amplitude * 16;

      const tiles: Array<{
        x: number;
        y: number;
        lift: number;
        depth: number;
        influence: number;
      }> = [];

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const dx = col - focusC;
          const dy = row - focusR;
          const dist = Math.hypot(dx, dy);
          const influence = Math.exp(
            -(dist * dist) / Math.max(0.001, radiusCells * radiusCells * 0.45),
          );
          const bob =
            0.5 +
            0.5 * Math.sin(t * GRID.speed * 3.2 + col * 0.5 + row * 0.37);
          tiles.push({
            x: originX + (col - row) * stepX * 0.5,
            y: originY + (col + row) * stepY * 0.5,
            lift: influence * (liftPxBase + bob * ampPx),
            depth: col + row,
            influence,
          });
        }
      }

      tiles.sort((a, b) => a.depth - b.depth);
      for (const tile of tiles) {
        if (tile.x < -cell * 2 || tile.x > w + cell * 2) continue;
        if (tile.y < -cell * 3 || tile.y > h + cell * 2) continue;

        const accentT = Math.min(1, tile.influence * colors.accentStrength);
        const face: FaceColors = {
          top: mixHex(colors.top, colors.accent, accentT),
          left: mixHex(colors.left, shade(colors.accent, 0.3), accentT * 0.9),
          right: mixHex(colors.right, shade(colors.accent, 0.45), accentT * 0.9),
        };
        drawPrism(
          tile.x,
          tile.y,
          halfW,
          halfH,
          tile.lift,
          face,
          GRID.rounding,
        );
      }

      const mistRgb =
        themeRef.current === "light" ? "228,227,218" : "14,0,0";
      const mist = context.createRadialGradient(
        w * 0.38,
        h * 0.42,
        Math.min(w, h) * 0.12,
        w * 0.5,
        h * 0.55,
        Math.max(w, h) * (0.5 + GRID.haze * 0.4),
      );
      mist.addColorStop(0, `rgba(${mistRgb},0)`);
      mist.addColorStop(0.4, `rgba(${mistRgb},0.06)`);
      mist.addColorStop(1, colors.haze);
      context.fillStyle = mist;
      context.fillRect(0, 0, w, h);
    }

    const minFrameMs = 1000 / GRID.maxFps;

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (pausedRef.current) {
        last = now;
        return;
      }
      if (now - last < minFrameMs * 0.85) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      const { w, h } = resize();
      if (w < 2 || h < 2) return;
      paint(w, h, elapsed);
    }

    canvasEl.style.width = "100%";
    canvasEl.style.height = "100%";
    canvasEl.style.display = "block";
    canvasEl.style.pointerEvents = "none";

    themeRef.current = theme;
    const size = resize();
    paint(size.w, size.h, 0);
    raf = requestAnimationFrame(frame);

    const onResize = () => {
      const next = resize();
      paint(next.w, next.h, elapsed);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className={["meet-lobby-grid", className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}
