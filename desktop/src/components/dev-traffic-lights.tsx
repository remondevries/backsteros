import { isTauriRuntime } from "../lib/tauri-runtime";

type DevTrafficLightsProps = {
  /** Native fullscreen hides the real controls; hide the stand-in too. */
  hidden?: boolean;
};

/**
 * Faded macOS traffic-light stand-in for the Vite browser preview.
 * Tauri already draws the real controls, so this stays off there and in production builds.
 */
export function DevTrafficLights({ hidden = false }: DevTrafficLightsProps) {
  if (!import.meta.env.DEV || hidden || isTauriRuntime()) return null;

  return (
    <div className="bos-dev-traffic-lights" aria-hidden="true">
      <span className="bos-dev-traffic-lights__close" />
      <span className="bos-dev-traffic-lights__minimize" />
      <span className="bos-dev-traffic-lights__zoom" />
    </div>
  );
}
