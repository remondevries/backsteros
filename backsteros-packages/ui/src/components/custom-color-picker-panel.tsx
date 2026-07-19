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
} from "../color-utils.js";

export type CustomColorPickerPanelProps = {
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

function ColorFieldSelector({ x, y }: { x: number; y: number }) {
  return (
    <span
      aria-hidden="true"
      className="custom-color-picker__field-selector"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    />
  );
}

function HueSliderThumb({ y }: { y: number }) {
  return (
    <span
      aria-hidden="true"
      className="custom-color-picker__hue-thumb"
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
  const [hsv, setHsv] = useState<HsvColor>(
    () => hexToHsv(color) ?? { h: 220, s: 0.15, v: 0.85 },
  );
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
    <div className="custom-color-picker">
      <div className="custom-color-picker__row">
        <span
          aria-hidden="true"
          className="custom-color-picker__swatch"
          style={{ backgroundColor: hsvToHex(hsv) }}
        />
        <div className="custom-color-picker__hex-field">
          <span className="custom-color-picker__hex-label">Hex</span>
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
            className="custom-color-picker__hex-input"
          />
        </div>
        <button
          type="button"
          aria-label="Spectrum color picker"
          aria-pressed
          className="custom-color-picker__spectrum-badge"
        >
          <span
            aria-hidden="true"
            className="custom-color-picker__spectrum-ring"
          />
        </button>
      </div>

      <div className="custom-color-picker__sliders">
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
          className="custom-color-picker__saturation"
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
          className="custom-color-picker__hue"
        >
          <HueSliderThumb y={hsv.h / 360} />
        </div>
      </div>
    </div>
  );
}
