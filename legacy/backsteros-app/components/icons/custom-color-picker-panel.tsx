"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  hexToHsv,
  hsvToHex,
  normalizeHexColor,
  type HsvColor,
} from "@/lib/color-utils";

type CustomColorPickerPanelProps = {
  color: string;
  onChange: (color: string) => void;
};

function getRelativePointerPosition(
  element: HTMLElement,
  clientX: number,
  clientY: number,
) {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function ColorFieldSelector({
  x,
  y,
}: {
  x: number;
  y: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    />
  );
}

function HueSliderThumb({ y }: { y: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 h-1.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white/95 shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
      style={{ top: `${y * 100}%` }}
    />
  );
}

export function CustomColorPickerPanel({
  color,
  onChange,
}: CustomColorPickerPanelProps) {
  const saturationRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(color) ?? { h: 220, s: 0.15, v: 0.85 });
  const [hexInput, setHexInput] = useState(color.toLowerCase());

  const colorSyncKey = color.toLowerCase();
  const [prevColorSyncKey, setPrevColorSyncKey] = useState(colorSyncKey);
  if (colorSyncKey !== prevColorSyncKey) {
    setPrevColorSyncKey(colorSyncKey);
    const next = hexToHsv(color);
    if (next) {
      setHsv(next);
      setHexInput(color.toLowerCase());
    }
  }

  const applyHsv = useCallback(
    (next: HsvColor) => {
      setHsv(next);
      const hex = hsvToHex(next);
      setHexInput(hex);
      onChange(hex);
    },
    [onChange],
  );

  function updateFromSaturation(clientX: number, clientY: number) {
    const element = saturationRef.current;
    if (!element) {
      return;
    }

    const { x, y } = getRelativePointerPosition(element, clientX, clientY);
    applyHsv({ ...hsv, s: x, v: 1 - y });
  }

  function updateFromHue(clientY: number) {
    const element = hueRef.current;
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const y = clamp01((clientY - rect.top) / rect.height);
    applyHsv({ ...hsv, h: y * 360 });
  }

  function bindSaturationDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromSaturation(event.clientX, event.clientY);
  }

  function bindHueDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromHue(event.clientY);
  }

  function handleHexCommit(value: string) {
    const normalized = normalizeHexColor(value);
    if (!normalized) {
      setHexInput(hsvToHex(hsv));
      return;
    }

    const nextHsv = hexToHsv(normalized);
    if (!nextHsv) {
      return;
    }

    setHsv(nextHsv);
    setHexInput(normalized);
    onChange(normalized);
  }

  const hueCss = hsv.h;
  const saturationBackground = {
    backgroundColor: `hsl(${hueCss} 100% 50%)`,
    backgroundImage:
      "linear-gradient(to right, #ffffff, transparent), linear-gradient(to top, #000000, transparent)",
  } as const;

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[#1a1b22] p-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="size-6 shrink-0 rounded-full border border-white/10"
          style={{ backgroundColor: hsvToHex(hsv) }}
        />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/40">
            Hex
          </span>
          <input
            type="text"
            value={hexInput}
            onChange={(event) => setHexInput(event.target.value)}
            onBlur={() => handleHexCommit(hexInput)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleHexCommit(hexInput);
                event.currentTarget.blur();
              }
            }}
            spellCheck={false}
            aria-label="Hex color value"
            className="min-w-0 flex-1 border-none bg-transparent p-0 font-mono text-sm text-foreground outline-none"
          />
        </div>
        <button
          type="button"
          aria-label="Spectrum color picker"
          aria-pressed
          className="relative flex size-7 shrink-0 items-center justify-center rounded-full border-none p-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#5b8def]"
          style={{
            background:
              "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)",
          }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full ring-2 ring-[#5b8def] ring-offset-2 ring-offset-[#1a1b22]"
          />
        </button>
      </div>

      <div className="flex gap-2.5">
        <div
          ref={saturationRef}
          role="slider"
          aria-label="Saturation and brightness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.s * 100)}
          tabIndex={0}
          onPointerDown={bindSaturationDrag}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              updateFromSaturation(event.clientX, event.clientY);
            }
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 0.1 : 0.02;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              applyHsv({ ...hsv, s: clamp01(hsv.s - step) });
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              applyHsv({ ...hsv, s: clamp01(hsv.s + step) });
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              applyHsv({ ...hsv, v: clamp01(hsv.v + step) });
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              applyHsv({ ...hsv, v: clamp01(hsv.v - step) });
            }
          }}
          className="relative h-[132px] min-w-0 flex-1 cursor-crosshair touch-none rounded-lg border border-white/8"
          style={saturationBackground}
        >
          <ColorFieldSelector x={hsv.s} y={1 - hsv.v} />
        </div>

        <div
          ref={hueRef}
          role="slider"
          aria-label="Hue"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          tabIndex={0}
          onPointerDown={bindHueDrag}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              updateFromHue(event.clientY);
            }
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 15 : 3;
            if (event.key === "ArrowUp") {
              event.preventDefault();
              applyHsv({ ...hsv, h: (hsv.h - step + 360) % 360 });
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              applyHsv({ ...hsv, h: (hsv.h + step) % 360 });
            }
          }}
          className="relative h-[132px] w-3.5 shrink-0 cursor-ns-resize touch-none rounded-full border border-white/8"
          style={{
            background:
              "linear-gradient(to bottom, #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)",
          }}
        >
          <HueSliderThumb y={hsv.h / 360} />
        </div>
      </div>
    </div>
  );
}
