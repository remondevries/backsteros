import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import {
  dismissBootSplash,
  startBootSplashWatchdog,
} from "../lib/boot-splash";

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  margin: 0,
  padding: "32px 24px",
  boxSizing: "border-box",
  background:
    "radial-gradient(ellipse 80% 60% at 50% 0%, rgb(255 255 255 / 0.06), transparent 70%), #0a0a0a",
  color: "#ededed",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  textAlign: "center",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: "-0.02em",
};

const bodyStyle: CSSProperties = {
  margin: 0,
  maxWidth: 420,
  fontSize: 14,
  lineHeight: 1.5,
  color: "rgba(237, 237, 237, 0.72)",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "center",
  marginTop: 8,
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  borderRadius: 10,
  padding: "10px 16px",
  background: "rgba(255, 255, 255, 0.1)",
  color: "#ededed",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const buttonSecondaryStyle: CSSProperties = {
  ...buttonStyle,
  background: "transparent",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  color: "rgba(237, 237, 237, 0.85)",
};

/**
 * Escape hatch when boot never clears after a bad HMR pass —
 * the HTML splash would otherwise spin forever with no way out except killing
 * the Tauri process. Children stay mounted so Continue does not remount auth.
 */
export function BootSplashWatchdog({
  children,
  cleared = false,
}: {
  children: ReactNode;
  /** When true, hide the stuck overlay. */
  cleared?: boolean;
}) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    return startBootSplashWatchdog(() => setStuck(true));
  }, []);

  useEffect(() => {
    if (stuck) dismissBootSplash();
  }, [stuck]);

  useEffect(() => {
    if (cleared) setStuck(false);
  }, [cleared]);

  return (
    <>
      {children}
      {stuck && !cleared ? (
        <div style={overlayStyle} role="alert">
          <h1 style={titleStyle}>Still loading</h1>
          <p style={bodyStyle}>
            Startup is taking longer than expected. You can keep waiting, or
            reload the window without quitting the desktop app.
          </p>
          <div style={actionsStyle}>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setStuck(false)}
            >
              Continue
            </button>
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
