import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  DoorClosed,
  DoorOpen,
  Lamp,
  LampSolid,
  Microphone,
  MicrophoneOff,
  MoonSolid,
  SunSolid,
  Video,
  VideoOff,
} from "@mynaui/icons-react";
import {
  MeetingsPickerPanel,
  MeetingsPickerTrigger,
} from "./components/MeetingsPickerPanel";
import type { HostMeeting } from "./lib/host-meetings";
import {
  markHostMeetingRoomClosed,
  markHostMeetingRoomOpened,
} from "./lib/host-meetings";
import {
  AudioVolumeIndicator,
  normalizeAudioLevel,
} from "./AudioVolumeIndicator";
import { BrandLogo } from "./BrandLogo";
import "./App.css";
import {
  MediaDeviceSelect,
  type MediaDeviceOption,
} from "./media-device-menu";
import { LobbyGridRise } from "./LobbyGridRise";
import { DirectorSyncStatus } from "./components/DirectorSyncStatus";
import { GuestPipVideo } from "./components/GuestPipVideo";
import { PresentationModeTabs } from "./components/PresentationModeTabs";
import { PresentationSurface } from "./components/PresentationSurface";
import { useMeetingContext } from "./hooks/use-meeting-context";
import {
  readStoredPresentationUrl,
  writeStoredPresentationUrl,
} from "./lib/presentation-url-storage";
import {
  PRESENTATION_LABELS,
  HOST_CAMERA_SLIDE_MS,
  presentationUsesUrlSync,
  type PresentationKind,
} from "./presentation";
import { Switch } from "./Switch";
import { useDirectorGoShortcuts } from "./use-director-go-shortcuts";
import {
  useDirectorLiveKit,
  visitorNotice,
  type GuestFeed,
} from "./use-director-livekit";
import { usePresentationKeyboardNav } from "./use-presentation-keyboard-nav";

const LOCALE = "en-GB";
const TRAFFIC_LIGHT_BASE = { x: 16, y: 28 };
const TRAFFIC_LIGHT_RING_INSET = 18;
const TRAFFIC_LIGHT_ANIMATION_MS = 180;
const PIP_FEED_SIZE_DEFAULT = 126;
const PIP_FEED_SIZE_MIN = 88;
const PIP_FEED_SIZE_MAX = 280;

type ResizeCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

function clampPipFeedSize(size: number): number {
  return Math.min(PIP_FEED_SIZE_MAX, Math.max(PIP_FEED_SIZE_MIN, size));
}

/** Corner of the feed that faces the stage center — the only resize grip. */
function getInwardResizeCorner(
  left: number,
  top: number,
  width: number,
  height: number,
  stageWidth: number,
  stageHeight: number,
): ResizeCorner {
  const right = left + width / 2 >= stageWidth / 2;
  const bottom = top + height / 2 >= stageHeight / 2;
  if (right && !bottom) return "bottom-left";
  if (!right && !bottom) return "bottom-right";
  if (right && bottom) return "top-left";
  return "top-right";
}

function resizeCursor(corner: ResizeCorner): string {
  return corner === "bottom-left" || corner === "top-right"
    ? "nesw-resize"
    : "nwse-resize";
}

/** Resolve a CSS length custom property to device pixels (rem-aware). */
function readCssLengthPx(root: Element, property: string, fallbackPx: number): number {
  const raw = getComputedStyle(root).getPropertyValue(property).trim();
  if (!raw) return fallbackPx;
  if (raw.endsWith("px")) return Number.parseFloat(raw) || fallbackPx;
  if (raw.endsWith("rem")) {
    const rem = Number.parseFloat(raw);
    const rootFont =
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
      16;
    return Number.isFinite(rem) ? rem * rootFont : fallbackPx;
  }
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;width:${raw}`;
  root.appendChild(probe);
  const px = probe.offsetWidth;
  probe.remove();
  return px || fallbackPx;
}

/** Equal gap from the large panel edges on every side. */
function getPipGutters(stage: HTMLElement): {
  side: number;
  top: number;
} {
  const root = stage.closest(".director") ?? document.documentElement;
  const cornerInset = readCssLengthPx(root, "--meet-feed-corner-inset", 26.4);
  const panelInset =
    Number.parseFloat(getComputedStyle(stage).paddingLeft) || 9.6;
  const paddingTop = Number.parseFloat(getComputedStyle(stage).paddingTop) || 0;
  const edgeGap = Math.max(0, cornerInset - panelInset);
  return {
    side: cornerInset,
    top: paddingTop + edgeGap,
  };
}

/** Resize while keeping the opposite corner fixed and respecting stage gutters. */
function resizePipAgainstGutter(options: {
  corner: ResizeCorner;
  startLeft: number;
  startTop: number;
  startSize: number;
  nextSize: number;
  stageWidth: number;
  stageHeight: number;
  gutter: number;
  topGutter: number;
  /** Full pip height for a given tile size (host may stack multiple tiles). */
  heightForSize?: (size: number) => number;
}): { left: number; top: number; size: number } {
  const heightForSize = options.heightForSize ?? ((size) => size);
  const startHeight = heightForSize(options.startSize);
  const fixedRight = options.startLeft + options.startSize;
  const fixedBottom = options.startTop + startHeight;
  const fixedLeft = options.startLeft;
  const fixedTop = options.startTop;

  let size = clampPipFeedSize(options.nextSize);
  const fits = (candidate: number) => {
    const height = heightForSize(candidate);
    switch (options.corner) {
      case "bottom-left":
        return (
          fixedRight - candidate >= options.gutter &&
          fixedTop + height <= options.stageHeight - options.gutter
        );
      case "bottom-right":
        return (
          fixedLeft + candidate <= options.stageWidth - options.gutter &&
          fixedTop + height <= options.stageHeight - options.gutter
        );
      case "top-left":
        return (
          fixedRight - candidate >= options.gutter &&
          fixedBottom - height >= options.topGutter
        );
      case "top-right":
        return (
          fixedLeft + candidate <= options.stageWidth - options.gutter &&
          fixedBottom - height >= options.topGutter
        );
    }
  };

  while (size > PIP_FEED_SIZE_MIN && !fits(size)) {
    size -= 1;
  }

  const height = heightForSize(size);
  switch (options.corner) {
    case "bottom-left":
      return { left: fixedRight - size, top: fixedTop, size };
    case "bottom-right":
      return { left: fixedLeft, top: fixedTop, size };
    case "top-left":
      return { left: fixedRight - size, top: fixedBottom - height, size };
    case "top-right":
      return { left: fixedLeft, top: fixedBottom - height, size };
  }
}

type HostCamAnim =
  | "audio-only"
  | "avatars-fading"
  | "idle-fading"
  | "camera-entering"
  | "camera-exit-armed"
  | "camera-exiting"
  | "live";

/**
 * Preload rail media, then animate. Same readiness gate for <video> and <img>
 * so circle fades match the host-feed enter pattern (frame ready → then move).
 */
type AvatarRailPhase =
  | "off"
  | "arming-out"
  | "poised-out"
  | "sliding-out"
  | "arming-in"
  | "poised-in"
  | "sliding-in"
  /** Exit finished — keep the overlay as the live circle rail (no video handoff). */
  | "held";

function waitForVideoFrame(
  video: HTMLVideoElement,
  signal: { cancelled: boolean },
  opts?: { forceNewFrame?: boolean },
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.cancelled) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("playing", onReady);
      window.clearTimeout(timeoutId);
      resolve();
    };

    const onReady = () => {
      const anyVideo = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      };
      if (typeof anyVideo.requestVideoFrameCallback === "function") {
        anyVideo.requestVideoFrameCallback(() => finish());
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => finish()));
    };

    const timeoutId = window.setTimeout(finish, 2500);

    if (
      !opts?.forceNewFrame &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      onReady();
      return;
    }
    if (opts?.forceNewFrame) {
      onReady();
    }
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("playing", onReady);
  });
}

function waitForImage(
  img: HTMLImageElement,
  signal: { cancelled: boolean },
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.cancelled) {
      resolve();
      return;
    }
    if (img.complete && img.naturalWidth > 0) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      img.removeEventListener("load", finish);
      img.removeEventListener("error", finish);
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, 2500);
    img.addEventListener("load", finish);
    img.addEventListener("error", finish);
    if (typeof img.decode === "function") {
      void img.decode().then(finish).catch(finish);
    }
  });
}

/** Wait until every video frame + image in the rail is painted (or times out). */
function waitForRailMedia(
  root: HTMLElement | null,
  signal: { cancelled: boolean },
  opts?: { forceNewFrame?: boolean },
): Promise<void> {
  if (!root || signal.cancelled) return Promise.resolve();
  const videos = Array.from(root.querySelectorAll("video"));
  const images = Array.from(root.querySelectorAll("img"));
  if (videos.length === 0 && images.length === 0) return Promise.resolve();

  return Promise.all([
    ...videos.map((video) => waitForVideoFrame(video, signal, opts)),
    ...images.map((img) => waitForImage(img, signal)),
  ]).then(() => undefined);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatSchedule(date: Date): string {
  const weekday = date.toLocaleDateString(LOCALE, { weekday: "long" });
  const month = date.toLocaleDateString(LOCALE, { month: "long" });
  return `on ${weekday}, ${date.getDate()} ${month} at ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatCountdown(start: Date, now: Date): string {
  const diffMs = start.getTime() - now.getTime();
  if (diffMs > 0) {
    const totalSec = Math.floor(diffMs / 1000);
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    return `Starts in ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }
  const agoMin = Math.floor(-diffMs / 60000);
  return agoMin < 1 ? "Meeting started" : `Started ${agoMin}m ago`;
}

function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function App() {
  const {
    meetingId,
    meetingTitle: contextMeetingTitle,
    meetingStart,
    selectMeeting,
  } = useMeetingContext();
  const meetingTitle = contextMeetingTitle?.trim() || "Untitled meeting";
  const [meetingsPanelOpen, setMeetingsPanelOpen] = useState(false);
  const [activeHostMeeting, setActiveHostMeeting] = useState<HostMeeting | null>(
    null,
  );
  const [muted, setMuted] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraTrackOn, setCameraTrackOn] = useState(false);
  const [hostCamAnim, setHostCamAnim] = useState<HostCamAnim>("audio-only");
  /** LiveKit room identity — updated after a clean disconnect on meeting switch. */
  const [liveKitMeetingId, setLiveKitMeetingId] = useState<string | null>(null);
  const [avatarRailPhase, setAvatarRailPhase] =
    useState<AvatarRailPhase>("off");
  /** Freeze guest camera/image choices for the avatar-rail overlay lifetime. */
  const [avatarRailGuests, setAvatarRailGuests] = useState<GuestFeed[]>([]);
  const [ringLight, setRingLight] = useState(false);
  /** Portal stage surround: dark #0e0000 / light #e4e3da */
  const [stageTheme, setStageTheme] = useState<"dark" | "light">("dark");
  /** When false, guests stay in lobby waiting; when true they may enter the room. */
  const [roomOpen, setRoomOpen] = useState(false);
  /** Local picker UI (g+p). Does not sync to guests by itself. */
  const [presentationMode, setPresentationMode] = useState(false);
  /** Widget the host is preparing (local). Guests only see it after Broadcast. */
  const [selectedPresentation, setSelectedPresentation] =
    useState<PresentationKind | null>(null);
  /**
   * Kind currently published to guests. Stays put while the host prepares a
   * different mode — only Broadcast / Stop / leave presentation changes it.
   */
  const [broadcastKind, setBroadcastKind] = useState<PresentationKind | null>(
    null,
  );
  /** Synced to guests for iframe (local) while that kind is broadcasting. */
  const [presentationUrl, setPresentationUrl] = useState<string | null>(null);
  /** Keyboard focus index for Local / Screenshare when none selected. */
  const [pickerFocus, setPickerFocus] = useState(0);
  const [guestPipPos, setGuestPipPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [guestPipDragging, setGuestPipDragging] = useState(false);
  const [guestPipSize, setGuestPipSize] = useState(PIP_FEED_SIZE_DEFAULT);
  const [guestPipResizeCorner, setGuestPipResizeCorner] =
    useState<ResizeCorner>("bottom-left");
  const [guestPipResizing, setGuestPipResizing] = useState(false);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceOption[]>([]);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const guestPipRef = useRef<HTMLDivElement>(null);
  const guestPipDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const guestPipResizeRef = useRef<{
    pointerId: number;
    corner: ResizeCorner;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startSize: number;
  } | null>(null);
  const trafficLightPositionRef = useRef(TRAFFIC_LIGHT_BASE);
  const previousCameraOnRef = useRef(cameraOn);
  const hostCamAnimGenRef = useRef(0);
  const meetingSwitchGenRef = useRef(0);
  const avatarRailAnimGenRef = useRef(0);
  const avatarRailPhaseRef = useRef<AvatarRailPhase>(avatarRailPhase);
  avatarRailPhaseRef.current = avatarRailPhase;
  const avatarRailRef = useRef<HTMLDivElement>(null);
  const presentationUrlHydratedRef = useRef(false);
  const now = useNow();

  useEffect(() => {
    if (presentationUrlHydratedRef.current) return;
    presentationUrlHydratedRef.current = true;
    const stored = readStoredPresentationUrl(meetingId);
    if (stored) setPresentationUrl(stored);
  }, [meetingId]);

  // Initial URL meeting → LiveKit (subsequent switches go through switchHostMeeting).
  useEffect(() => {
    const id = meetingId?.trim() || null;
    if (!id) return;
    setLiveKitMeetingId((current) => current ?? id);
  }, [meetingId]);

  useEffect(() => {
    if (!presentationUrl) return;
    writeStoredPresentationUrl(meetingId, presentationUrl);
  }, [meetingId, presentationUrl]);
  const calendar = useMemo(() => {
    if (!now) {
      return { month: "—", day: "—", weekday: "—", time: "—" };
    }
    return {
      month: now.toLocaleDateString(LOCALE, { month: "long" }),
      day: String(now.getDate()),
      weekday: now.toLocaleDateString(LOCALE, { weekday: "long" }),
      time: now.toLocaleTimeString(LOCALE, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    };
  }, [now]);

  const isBroadcasting = broadcastKind !== null;
  const livePresentation = broadcastKind;
  const selectedIsLive =
    selectedPresentation !== null && selectedPresentation === broadcastKind;

  const {
    roomName,
    connectionError,
    connected,
    waitingCount,
    readyCount,
    inRoomCount,
    guestFeeds,
    localCameraReady,
    hostAudioLevel,
    guestAudioLevels,
    bindGuestVideoEl,
    bindEnteringGuestVideoEl,
    viewportStreamPhase,
    viewportStreamError,
    viewportPreviewStream,
    startViewportStream,
    stopViewportStream,
  } = useDirectorLiveKit({
      cameraOn: cameraTrackOn,
      cameraIntent: cameraOn,
      muted,
      selectedDeviceId,
      selectedAudioDeviceId,
      localVideoRef: videoRef,
      activePresentation: livePresentation,
      presentationUrl:
        broadcastKind === "local" ? presentationUrl : null,
      meetingId: liveKitMeetingId,
      stageTheme,
      roomOpen,
      viewportCaptureEnabled:
        selectedPresentation === "screenshare" ||
        broadcastKind === "screenshare",
    });

  const guestFeedsRef = useRef(guestFeeds);
  guestFeedsRef.current = guestFeeds;

  // Keep the LiveKit track live through the exit slide; only mute after audio-only.
  useEffect(() => {
    if (cameraOn) {
      setCameraTrackOn(true);
      return;
    }
    if (hostCamAnim === "audio-only") {
      setCameraTrackOn(false);
    }
  }, [cameraOn, hostCamAnim]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("meet-theme-light", stageTheme === "light");
    root.classList.toggle("meet-theme-dark", stageTheme === "dark");
  }, [stageTheme]);

  useEffect(() => {
    if (!isTauri()) return;

    const from = trafficLightPositionRef.current;
    const inset = ringLight ? TRAFFIC_LIGHT_RING_INSET : 0;
    const target = {
      x: TRAFFIC_LIGHT_BASE.x + inset,
      y: TRAFFIC_LIGHT_BASE.y + inset,
    };
    const startedAt = performance.now();
    let frame = 0;
    let commandFailed = false;

    const animate = (now: number) => {
      const progress = Math.min(
        1,
        (now - startedAt) / TRAFFIC_LIGHT_ANIMATION_MS,
      );
      const eased = 1 - Math.pow(1 - progress, 3);
      const position = {
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
      };
      trafficLightPositionRef.current = position;
      if (!commandFailed) {
        void invoke("set_traffic_light_position", position).catch((error) => {
          commandFailed = true;
          console.warn("[Director] could not move traffic lights:", error);
        });
      }
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [ringLight]);

  const stagePresentation =
    presentationMode || selectedPresentation !== null;
  const cameraReadinessDependency = cameraOn ? localCameraReady : null;

  useEffect(() => {
    // Keep the avatar layout visible until the camera has produced a frame.
    // This prevents the black preview surface from sliding into view first.
    if (cameraOn && !cameraReadinessDependency) {
      return;
    }

    if (previousCameraOnRef.current === cameraOn) {
      return;
    }
    previousCameraOnRef.current = cameraOn;
    ++hostCamAnimGenRef.current;

    setAvatarRailGuests(guestFeedsRef.current);
    if (cameraOn) {
      // Already showing the held overlay from a prior exit — fade it out in place
      // (no remount / no video handoff).
      if (avatarRailPhaseRef.current === "held") {
        setAvatarRailPhase("poised-out");
      } else {
        setAvatarRailPhase("arming-out");
      }
    } else {
      setAvatarRailPhase("arming-in");
    }
  }, [cameraOn, cameraReadinessDependency]);

  // Keep the held rail guest list live while it stands in for the circle stack.
  useEffect(() => {
    if (avatarRailPhase !== "held") return;
    setAvatarRailGuests(guestFeeds);
  }, [avatarRailPhase, guestFeeds]);

  // After rail media has a painted frame, park then animate (same as host enter).
  useEffect(() => {
    if (avatarRailPhase !== "arming-out" && avatarRailPhase !== "arming-in") {
      return;
    }
    let cancelled = false;
    const signal = { cancelled: false };
    const phase = avatarRailPhase;
    const railGen = ++avatarRailAnimGenRef.current;

    void (async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      await waitForRailMedia(avatarRailRef.current, signal);
      if (cancelled || avatarRailAnimGenRef.current !== railGen) return;

      // Park in the start pose with no transition, matching host feed enter.
      setAvatarRailPhase(phase === "arming-out" ? "poised-out" : "poised-in");
    })();

    return () => {
      cancelled = true;
      signal.cancelled = true;
    };
  }, [avatarRailPhase]);

  // Release the park pose so circles and host feed move together.
  useLayoutEffect(() => {
    if (avatarRailPhase !== "poised-out" && avatarRailPhase !== "poised-in") {
      return;
    }
    const rail = avatarRailRef.current;
    if (rail) void rail.offsetWidth;
    const railGen = avatarRailAnimGenRef.current;
    const phase = avatarRailPhase;

    const releaseTimer = window.setTimeout(() => {
      if (avatarRailAnimGenRef.current !== railGen) return;
      if (phase === "poised-out") {
        // Enter: avatars fade out in the same beat the feed parks off-screen.
        setAvatarRailPhase("sliding-out");
        setHostCamAnim("camera-entering");
      } else {
        // Exit: hold avatars poised until the feed park releases (below).
        setHostCamAnim("camera-exit-armed");
      }
    }, 32);

    return () => {
      window.clearTimeout(releaseTimer);
    };
  }, [avatarRailPhase]);

  // Fallback if animationend doesn't fire (tab background, reduced motion, etc.).
  useEffect(() => {
    if (avatarRailPhase !== "sliding-out" && avatarRailPhase !== "sliding-in") {
      return;
    }
    const railGen = avatarRailAnimGenRef.current;
    const phase = avatarRailPhase;
    const fallbackTimer = window.setTimeout(() => {
      if (avatarRailAnimGenRef.current !== railGen) return;
      if (phase === "sliding-out") {
        setAvatarRailPhase("off");
      } else {
        // Keep the overlay as the circle rail — never hand off to pip videos.
        setHostCamAnim("audio-only");
        setAvatarRailPhase("held");
      }
    }, HOST_CAMERA_SLIDE_MS + 80);
    return () => window.clearTimeout(fallbackTimer);
  }, [avatarRailPhase]);

  useLayoutEffect(() => {
    if (hostCamAnim !== "camera-entering") return;
    const preview = previewRef.current;
    if (preview) void preview.offsetWidth;
    const gen = hostCamAnimGenRef.current;
    const slideTimer = window.setTimeout(() => {
      if (hostCamAnimGenRef.current !== gen) return;
      setHostCamAnim("live");
    }, 32);
    return () => window.clearTimeout(slideTimer);
  }, [hostCamAnim]);

  // Exit mirrors enter: hold on-screen with no transition, then slide off + fade avatars in.
  useLayoutEffect(() => {
    if (hostCamAnim !== "camera-exit-armed") return;
    const preview = previewRef.current;
    if (preview) void preview.offsetWidth;
    const gen = hostCamAnimGenRef.current;
    const railGen = avatarRailAnimGenRef.current;
    const slideTimer = window.setTimeout(() => {
      if (hostCamAnimGenRef.current !== gen) return;
      setHostCamAnim("camera-exiting");
      if (avatarRailAnimGenRef.current === railGen) {
        setAvatarRailPhase("sliding-in");
      }
    }, 32);
    return () => window.clearTimeout(slideTimer);
  }, [hostCamAnim]);

  useEffect(() => {
    let cancelled = false;

    /**
     * Browsers/WKWebView blank `device.label` until getUserMedia has succeeded
     * once. Without that we only show "Camera 1" / "Microphone 1".
     */
    async function unlockDeviceLabels(): Promise<void> {
      try {
        const preliminary = await navigator.mediaDevices.enumerateDevices();
        const av = preliminary.filter(
          (device) =>
            device.kind === "videoinput" || device.kind === "audioinput",
        );
        if (av.length === 0 || av.every((device) => device.label)) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        for (const track of stream.getTracks()) track.stop();
      } catch (err) {
        console.log("[Director] media permission for labels failed:", err);
      }
    }

    async function refreshMediaInputs() {
      try {
        await unlockDeviceLabels();
        if (cancelled) return;

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;

        const cameras = devices
          .filter((device) => device.kind === "videoinput")
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${index + 1}`,
          }));
        const mics = devices
          .filter((device) => device.kind === "audioinput")
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${index + 1}`,
          }));

        setVideoInputs(cameras);
        setAudioInputs(mics);
        setSelectedDeviceId((current) => {
          if (current && cameras.some((input) => input.deviceId === current)) {
            return current;
          }
          return cameras[0]?.deviceId ?? "";
        });
        setSelectedAudioDeviceId((current) => {
          if (current && mics.some((input) => input.deviceId === current)) {
            return current;
          }
          return mics[0]?.deviceId ?? "";
        });
      } catch (err) {
        console.log("[Director] enumerateDevices failed:", err);
      }
    }

    void refreshMediaInputs();
    navigator.mediaDevices.addEventListener("devicechange", refreshMediaInputs);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        refreshMediaInputs,
      );
    };
  }, []);

  // LiveKit/camera publish also grants permission — refresh labels afterward.
  useEffect(() => {
    if (!cameraOn && muted) return;
    let cancelled = false;
    void (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setVideoInputs(
          devices
            .filter((device) => device.kind === "videoinput")
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Camera ${index + 1}`,
            })),
        );
        setAudioInputs(
          devices
            .filter((device) => device.kind === "audioinput")
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Microphone ${index + 1}`,
            })),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cameraOn, muted]);

  function closePresentation() {
    void stopViewportStream();
    setBroadcastKind(null);
    setPresentationMode(false);
    setSelectedPresentation(null);
    setPresentationUrl(null);
  }

  async function startBroadcast() {
    if (!selectedPresentation) return;
    if (selectedPresentation === "screenshare") {
      const started = await startViewportStream();
      if (!started) return;
    } else if (selectedPresentation === "local") {
      if (!presentationUrl) return;
      if (broadcastKind === "screenshare") {
        void stopViewportStream();
      }
    }
    setBroadcastKind(selectedPresentation);
    console.log("[Director] broadcast on:", selectedPresentation);
  }

  function stopBroadcast() {
    void stopViewportStream();
    setBroadcastKind(null);
    console.log("[Director] broadcast off");
  }

  function togglePresentationMode() {
    setPresentationMode((prev) => {
      const next = !prev;
      console.log("[Director] presentation mode:", next, "(g+p)");
      if (!next) {
        void stopViewportStream();
        setBroadcastKind(null);
        setSelectedPresentation(null);
      } else {
        setPickerFocus(0);
      }
      return next;
    });
  }

  function selectPresentation(kind: PresentationKind) {
    // Host prepare only — keep any live broadcast on the previous kind until
    // Broadcast replaces it (avoids guest flicker while switching tabs).
    setPresentationMode(true);
    if (selectedPresentation === kind) return;
    console.log("[Director] presentation kind:", kind);
    setPickerFocus(kind === "local" ? 0 : 1);
    setSelectedPresentation(kind);
  }

  // OS ended the share → drop broadcast only if screenshare is what's live.
  useEffect(() => {
    if (broadcastKind === "screenshare" && viewportStreamPhase === "idle") {
      setBroadcastKind(null);
    }
  }, [broadcastKind, viewportStreamPhase]);

  useDirectorGoShortcuts({
    onTogglePresentation: togglePresentationMode,
    onToggleRingLight: () => setRingLight((current) => !current),
    onToggleCamera: () => setCameraOn((current) => !current),
    onToggleMicrophone: () => setMuted((current) => !current),
    onOpenRoom: () => {
      void onRoomOpenChange(true);
    },
    onCloseRoom: () => {
      void onRoomOpenChange(false);
    },
    onLightMode: () => setStageTheme("light"),
    onDarkMode: () => setStageTheme("dark"),
  });

  usePresentationKeyboardNav({
    enabled: presentationMode || selectedPresentation !== null,
    activePresentation: selectedPresentation,
    pickerFocus,
    onPickerFocusChange: setPickerFocus,
    onSelect: selectPresentation,
    onClose: closePresentation,
  });

  const roomMeta = !liveKitMeetingId
    ? "Select a meeting"
    : connected
    ? [
        waitingCount > 0 ? visitorNotice(waitingCount, "waiting") : null,
        readyCount > 0 ? visitorNotice(readyCount, "ready") : null,
        `${inRoomCount} in room`,
        selectedPresentation
          ? `${
              selectedIsLive
                ? "broadcast"
                : broadcastKind
                  ? `prepare (live: ${PRESENTATION_LABELS[broadcastKind]})`
                  : "prepare"
            }: ${PRESENTATION_LABELS[selectedPresentation]}${
              presentationUrl && presentationUsesUrlSync(selectedPresentation)
                ? ` · ${presentationUrl}`
                : ""
            }`
          : presentationMode
            ? "pick a presentation"
            : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : connectionError
      ? `LiveKit: ${connectionError}`
      : "Connecting to LiveKit…";

  const hostAudioOnlyLayout =
    hostCamAnim === "audio-only" ||
    hostCamAnim === "avatars-fading" ||
    hostCamAnim === "idle-fading";
  const cameraOffPanelLayout =
    hostAudioOnlyLayout ||
    hostCamAnim === "camera-exit-armed" ||
    hostCamAnim === "camera-exiting";
  const hostAvatarVisible =
    hostCamAnim === "audio-only" || hostCamAnim === "avatars-fading";
  // Keep details mounted during camera-entering so they can slide out with the feed.
  const showMeetingDetails =
    cameraOffPanelLayout || hostCamAnim === "camera-entering";
  const avatarRailAnimating = avatarRailPhase !== "off";
  const avatarRailArming =
    avatarRailPhase === "arming-out" || avatarRailPhase === "arming-in";
  const avatarRailHeld = avatarRailPhase === "held";

  const directorClass = [
    "director",
    stagePresentation ? "is-presentation" : null,
    isBroadcasting ? "is-presenting-live" : null,
    hostAudioOnlyLayout ? "is-host-audio-only" : null,
    cameraOffPanelLayout ? "is-camera-off" : null,
    showMeetingDetails ? "is-meeting-details" : null,
    hostCamAnim === "avatars-fading" ? "is-avatars-fading" : null,
    hostCamAnim === "idle-fading" ? "is-idle-fading" : null,
    hostCamAnim === "camera-entering" ? "is-camera-entering" : null,
    hostCamAnim === "camera-exit-armed" ? "is-camera-exit-armed" : null,
    hostCamAnim === "camera-exiting" ? "is-camera-exiting" : null,
    avatarRailAnimating ? "is-avatar-rail-animating" : null,
    avatarRailHeld ? "is-avatar-rail-held" : null,
    avatarRailPhase === "poised-out" || avatarRailPhase === "sliding-out"
      ? "is-avatar-stack-swapped"
      : null,
    ringLight ? "is-ring-light" : null,
    meetingsPanelOpen ? "is-meetings-open" : null,
    stageTheme === "light" ? "is-theme-light" : "is-theme-dark",
  ]
    .filter(Boolean)
    .join(" ");
  const directorStyle = {
    "--pip-feed-size": `${guestPipSize}px`,
  } as CSSProperties;
  const avatarStackClass = [
    "director__avatar-stack",
    hostAudioOnlyLayout ? "has-host" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const guestPipDraggable =
    hostCamAnim === "live" && guestFeeds.length > 0;
  const guestPipClass = [
    "director__guest-pip",
    guestPipDraggable ? "is-draggable" : null,
    guestPipPos && guestPipDraggable ? "is-placed" : null,
    guestPipDragging ? "is-dragging" : null,
    guestPipResizing ? "is-resizing" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const guestPipStyle =
    guestPipPos && guestPipDraggable
      ? { left: guestPipPos.left, top: guestPipPos.top }
      : undefined;

  function clampSmallFeeds(
    element: HTMLDivElement,
    left: number,
    top: number,
    size = guestPipSize,
  ) {
    const stage = element.closest(".director__stage");
    if (!(stage instanceof HTMLElement)) return { left, top };
    const stageBox = stage.getBoundingClientRect();
    const { side: gutter, top: topGutter } = getPipGutters(stage);
    const gap = 0.65 * 16;
    const tileCount = Math.max(1, guestFeeds.length);
    const width = size;
    const height = tileCount * size + Math.max(0, tileCount - 1) * gap;
    return {
      left: Math.min(
        Math.max(left, gutter),
        Math.max(gutter, stageBox.width - width - gutter),
      ),
      top: Math.min(
        Math.max(top, topGutter),
        Math.max(topGutter, stageBox.height - height - gutter),
      ),
    };
  }

  function syncGuestPipResizeCorner() {
    const pip = guestPipRef.current;
    const stage = pip?.closest(".director__stage");
    if (!pip || !(stage instanceof HTMLElement)) return;
    const stageBox = stage.getBoundingClientRect();
    const pipBox = pip.getBoundingClientRect();
    setGuestPipResizeCorner(
      getInwardResizeCorner(
        pipBox.left - stageBox.left,
        pipBox.top - stageBox.top,
        pipBox.width,
        pipBox.height,
        stageBox.width,
        stageBox.height,
      ),
    );
  }

  useLayoutEffect(() => {
    if (!guestPipDraggable) return;
    syncGuestPipResizeCorner();
  }, [
    guestPipDraggable,
    guestPipPos,
    guestPipSize,
    guestFeeds.length,
    stagePresentation,
  ]);

  function onSmallFeedsPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!guestPipDraggable) return;
    if ((event.target as HTMLElement | null)?.closest(".pip-resize-handle")) {
      return;
    }
    const pip = guestPipRef.current;
    const stage = pip?.closest(".director__stage");
    if (!pip || !(stage instanceof HTMLElement)) return;
    event.preventDefault();
    const pipBox = pip.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    guestPipDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - pipBox.left,
      offsetY: event.clientY - pipBox.top,
    };
    setGuestPipDragging(true);
    pip.setPointerCapture(event.pointerId);
    setGuestPipPos({
      left: pipBox.left - stageBox.left,
      top: pipBox.top - stageBox.top,
    });
  }

  function onSmallFeedsPointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const resize = guestPipResizeRef.current;
    if (resize && resize.pointerId === event.pointerId) {
      const pip = guestPipRef.current;
      const stage = pip?.closest(".director__stage");
      if (!pip || !(stage instanceof HTMLElement)) return;
      const stageBox = stage.getBoundingClientRect();
      const { side: gutter, top: topGutter } = getPipGutters(stage);
      const dx = event.clientX - resize.startX;
      const dy = event.clientY - resize.startY;
      let delta = 0;
      switch (resize.corner) {
        case "bottom-left":
          delta = (-dx + dy) / 2;
          break;
        case "bottom-right":
          delta = (dx + dy) / 2;
          break;
        case "top-left":
          delta = (-dx - dy) / 2;
          break;
        case "top-right":
          delta = (dx - dy) / 2;
          break;
      }
      const gap = 0.65 * 16;
      const tileCount = Math.max(1, guestFeeds.length);
      const next = resizePipAgainstGutter({
        corner: resize.corner,
        startLeft: resize.startLeft,
        startTop: resize.startTop,
        startSize: resize.startSize,
        nextSize: resize.startSize + delta,
        stageWidth: stageBox.width,
        stageHeight: stageBox.height,
        gutter,
        topGutter,
        heightForSize: (size) =>
          tileCount * size + Math.max(0, tileCount - 1) * gap,
      });
      setGuestPipSize(next.size);
      setGuestPipPos({ left: next.left, top: next.top });
      return;
    }

    const drag = guestPipDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pip = guestPipRef.current;
    const stage = pip?.closest(".director__stage");
    if (!pip || !(stage instanceof HTMLElement)) return;
    const stageBox = stage.getBoundingClientRect();
    setGuestPipPos(
      clampSmallFeeds(
        pip,
        event.clientX - stageBox.left - drag.offsetX,
        event.clientY - stageBox.top - drag.offsetY,
      ),
    );
  }

  function onSmallFeedsPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = guestPipResizeRef.current;
    if (resize && resize.pointerId === event.pointerId) {
      guestPipResizeRef.current = null;
      setGuestPipResizing(false);
      syncGuestPipResizeCorner();
      try {
        guestPipRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      return;
    }

    const drag = guestPipDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    guestPipDragRef.current = null;
    const pip = guestPipRef.current;
    const stage = pip?.closest(".director__stage");
    if (pip && stage instanceof HTMLElement) {
      const stageBox = stage.getBoundingClientRect();
      const pipBox = pip.getBoundingClientRect();
      const { side: gutter, top: topGutter } = getPipGutters(stage);
      const maxLeft = Math.max(
        gutter,
        stageBox.width - pipBox.width - gutter,
      );
      const maxTop = Math.max(
        topGutter,
        stageBox.height - pipBox.height - gutter,
      );
      setGuestPipPos({
        left:
          pipBox.left - stageBox.left + pipBox.width / 2 < stageBox.width / 2
            ? gutter
            : maxLeft,
        top:
          pipBox.top - stageBox.top + pipBox.height / 2 < stageBox.height / 2
            ? topGutter
            : maxTop,
      });
    }
    setGuestPipDragging(false);
    syncGuestPipResizeCorner();
    try {
      pip?.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  }

  function onPipResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!guestPipDraggable) return;
    event.preventDefault();
    event.stopPropagation();
    const pip = guestPipRef.current;
    const stage = pip?.closest(".director__stage");
    if (!pip || !(stage instanceof HTMLElement)) return;
    const stageBox = stage.getBoundingClientRect();
    const pipBox = pip.getBoundingClientRect();
    const left = pipBox.left - stageBox.left;
    const top = pipBox.top - stageBox.top;
    const corner = getInwardResizeCorner(
      left,
      top,
      pipBox.width,
      pipBox.height,
      stageBox.width,
      stageBox.height,
    );
    setGuestPipResizeCorner(corner);
    guestPipResizeRef.current = {
      pointerId: event.pointerId,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: left,
      startTop: top,
      startSize: guestPipSize,
    };
    setGuestPipResizing(true);
    setGuestPipPos({ left, top });
    pip.setPointerCapture(event.pointerId);
  }

  function onSelectHostMeeting(meeting: HostMeeting) {
    void switchHostMeeting(meeting);
  }

  async function switchHostMeeting(meeting: HostMeeting) {
    setActiveHostMeeting(meeting);
    setRoomOpen(false);
    if (meeting.id === meetingId && meeting.id === liveKitMeetingId) return;

    const switchGen = ++meetingSwitchGenRef.current;

    // Camera off before any LiveKit teardown (WebKit.GPU abort otherwise).
    setCameraOn(false);
    setCameraTrackOn(false);
    setHostCamAnim("audio-only");
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Force a full disconnect gap before joining the next room.
    setLiveKitMeetingId(null);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 600);
    });
    if (switchGen !== meetingSwitchGenRef.current) return;

    selectMeeting({
      meetingId: meeting.id,
      title: meeting.title,
      startAt: meeting.startAt,
    });
    setLiveKitMeetingId(meeting.id);
  }

  async function onRoomOpenChange(open: boolean) {
    setRoomOpen(open);
    const scopedId = meetingId?.trim();
    if (!scopedId) return;
    try {
      const current =
        activeHostMeeting?.id === scopedId ? activeHostMeeting : null;
      const { fetchHostMeetings } = await import("./lib/host-meetings");
      const meeting =
        current ??
        (await fetchHostMeetings()).find((row) => row.id === scopedId) ??
        null;
      if (!meeting) return;
      const updated = open
        ? await markHostMeetingRoomOpened(meeting)
        : await markHostMeetingRoomClosed(meeting);
      setActiveHostMeeting(updated);
      if (updated.startAt && updated.startAt !== meeting.startAt) {
        selectMeeting({
          meetingId: updated.id,
          title: updated.title,
          startAt: updated.startAt,
        });
      }
    } catch (err) {
      console.log(
        "[Director] meeting schedule sync failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return (
    <main className={directorClass} style={directorStyle}>
      <MeetingsPickerPanel
        open={meetingsPanelOpen}
        onOpenChange={setMeetingsPanelOpen}
        activeMeetingId={meetingId}
        onSelectMeeting={onSelectHostMeeting}
      />
      <div className="director__main">
      {(!stagePresentation || showMeetingDetails) ? (
        <div
          className={[
            "meet-brand",
            cameraOffPanelLayout ? "is-named" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Lemo Design"
        >
          <BrandLogo className="meet-brand__logo" />
          <span className="meet-brand__name" aria-hidden={!cameraOffPanelLayout}>
            Lemo-Design
          </span>
        </div>
      ) : null}
      <header className="director__ribbon" data-tauri-drag-region>
        <div className="director__ribbon-meta">
          <MeetingsPickerTrigger
            open={meetingsPanelOpen}
            onOpenChange={setMeetingsPanelOpen}
            startAt={activeHostMeeting?.startAt ?? meetingStart?.toISOString() ?? null}
            endAt={activeHostMeeting?.endAt ?? null}
            status={activeHostMeeting?.status ?? null}
          />
          <Switch
            className="director__switch--room"
            checked={roomOpen}
            onCheckedChange={(open) => {
              void onRoomOpenChange(open);
            }}
            label={roomOpen ? "Room open" : "Room closed"}
            icon={
              roomOpen ? (
                <DoorOpen className="director__switch-icon" />
              ) : (
                <DoorClosed className="director__switch-icon" />
              )
            }
          />
          <h1 className="director__title" data-tauri-drag-region>
            {meetingTitle}
          </h1>
          <span className="director__ribbon-sep" aria-hidden>
            ·
          </span>
          <p className="director__room-meta" data-tauri-drag-region>
            {roomMeta}
          </p>
        </div>
        <PresentationModeTabs
          selected={selectedPresentation}
          broadcastKind={broadcastKind}
          focusedIndex={pickerFocus}
          onSelect={selectPresentation}
        />
        <div className="director__ribbon-controls">
          <div className="director__device-control">
            <Switch
              className="director__switch--media"
              checked={!muted}
              onCheckedChange={(on) => setMuted(!on)}
              label={muted ? "Microphone off" : "Microphone on"}
              icon={
                muted ? (
                  <MicrophoneOff className="director__switch-icon" />
                ) : (
                  <Microphone className="director__switch-icon" />
                )
              }
            />
            <MediaDeviceSelect
              devices={audioInputs}
              value={selectedAudioDeviceId}
              disabled={muted || audioInputs.length === 0}
              onValueChange={(deviceId) => {
                console.log("[Director] audio input:", deviceId);
                setSelectedAudioDeviceId(deviceId);
              }}
              emptyLabel="No microphones found"
              ariaLabel="Microphone input"
            />
          </div>
          <div className="director__device-control">
            <Switch
              className="director__switch--media"
              checked={cameraOn}
              onCheckedChange={setCameraOn}
              label={cameraOn ? "Camera on" : "Camera off"}
              icon={
                cameraOn ? (
                  <Video className="director__switch-icon" />
                ) : (
                  <VideoOff className="director__switch-icon" />
                )
              }
            />
            <MediaDeviceSelect
              devices={videoInputs}
              value={selectedDeviceId}
              disabled={!cameraOn || videoInputs.length === 0}
              onValueChange={(deviceId) => {
                console.log("[Director] video input:", deviceId);
                setSelectedDeviceId(deviceId);
              }}
              emptyLabel="No cameras found"
              ariaLabel="Video input"
            />
          </div>
          <Switch
            checked={stageTheme === "dark"}
            onCheckedChange={(dark) =>
              setStageTheme(dark ? "dark" : "light")
            }
            label={stageTheme === "dark" ? "Dark stage" : "Light stage"}
            icon={
              stageTheme === "dark" ? (
                <MoonSolid className="director__switch-icon" />
              ) : (
                <SunSolid className="director__switch-icon" />
              )
            }
          />
          <Switch
            checked={ringLight}
            onCheckedChange={setRingLight}
            label={ringLight ? "Ring light on" : "Ring light off"}
            icon={
              ringLight ? (
                <LampSolid className="director__switch-icon" />
              ) : (
                <Lamp className="director__switch-icon" />
              )
            }
          />
        </div>
      </header>

      <div className="director__stage">
        {showMeetingDetails ? (
          <div
            className="director__meeting-details"
            aria-hidden={hostCamAnim === "camera-entering"}
          >
            {!stagePresentation ? (
              <LobbyGridRise
                theme={stageTheme}
                className="lobby-grid-rise is-live director__meeting-grid"
              />
            ) : null}
            <section
              className="director__meeting-calendar"
              aria-label="Meeting details"
            >
              <p className="cal-month cal-fade-slow">{calendar.month}</p>
              <p className="cal-day cal-fade">{calendar.day}</p>
              <p className="cal-weekday cal-fade-slow">{calendar.weekday}</p>
              <p className="cal-time cal-fade">{calendar.time}</p>
              <div className="director__idle-meta">
                <h2 className="director__idle-title">{meetingTitle}</h2>
                <p className="director__idle-schedule">
                  {meetingStart ? formatSchedule(meetingStart) : "—"}
                </p>
                <p className="director__idle-countdown">
                  {meetingStart && now
                    ? formatCountdown(meetingStart, now)
                    : "—"}
                </p>
              </div>
            </section>
          </div>
        ) : null}
        <section className="director__canvas" aria-label="Presentation">
          {selectedPresentation ? (
            <div className="director__presentation-live">
              <PresentationSurface
                kind={selectedPresentation}
                url={presentationUrl}
                onUrlChange={setPresentationUrl}
                isBroadcasting={selectedIsLive}
                viewportPhase={viewportStreamPhase}
                viewportError={viewportStreamError}
                previewStream={viewportPreviewStream}
                onBroadcast={() => void startBroadcast()}
                onStopBroadcast={stopBroadcast}
              />
            </div>
          ) : stagePresentation ? (
            <div className="director__presentation-empty">
              <p className="director__presentation-eyebrow">Presentation</p>
              <h2 className="director__presentation-title">
                Choose a mode
              </h2>
              <p className="director__presentation-copy">
                Pick <strong>Local</strong> or <strong>Screenshare</strong> in
                the toolbar. Host layout is already open — Broadcast is what
                guests will see.
              </p>
            </div>
          ) : null}
          {stagePresentation ? (
            <DirectorSyncStatus
              connected={connected}
              roomName={roomName}
              meetingId={meetingId}
              selectedPresentation={selectedPresentation}
              broadcastKind={broadcastKind}
              presentationUrl={presentationUrl}
              viewportPhase={viewportStreamPhase}
            />
          ) : null}
        </section>

        <div className={avatarStackClass}>
          <aside
            ref={previewRef}
            className="director__preview"
            style={
              {
                "--avatar-audio-level": normalizeAudioLevel(
                  muted ? 0 : hostAudioLevel,
                ),
              } as CSSProperties
            }
            aria-label="Local camera preview"
          >
            <video
              ref={videoRef}
              className="director__video"
              autoPlay
              playsInline
              muted
              hidden={hostAvatarVisible || Boolean(connectionError)}
            />
            {hostAvatarVisible && !connectionError ? (
              <div className="director__host-avatar">
                <img
                  className="director__host-avatar__photo"
                  src="/host/avatar.png"
                  alt=""
                />
              </div>
            ) : null}
            {connectionError ? (
              <div className="director__preview-empty">
                {`LiveKit: ${connectionError}`}
              </div>
            ) : null}
            {hostAudioOnlyLayout && !connectionError ? (
              <span className="director__avatar-name-badge" title="You">
                You
              </span>
            ) : !hostAudioOnlyLayout && cameraOn ? (
              <span className="director__preview-label">You · host</span>
            ) : null}
            <AudioVolumeIndicator
              level={muted ? 0 : hostAudioLevel}
              className="audio-vu--feed"
            />
          </aside>
          {guestFeeds.length > 0 ? (
            <div
              ref={guestPipRef}
              className={guestPipClass}
              style={guestPipStyle}
              aria-label="Guests in room"
              onPointerDown={
                guestPipDraggable
                  ? onSmallFeedsPointerDown
                  : undefined
              }
              onPointerMove={
                guestPipDraggable ? onSmallFeedsPointerMove : undefined
              }
              onPointerUp={
                guestPipDraggable ? onSmallFeedsPointerUp : undefined
              }
              onPointerCancel={
                guestPipDraggable ? onSmallFeedsPointerUp : undefined
              }
            >
              {guestPipDraggable ? (
                <button
                  type="button"
                  className={`pip-resize-handle is-${guestPipResizeCorner}`}
                  style={{ cursor: resizeCursor(guestPipResizeCorner) }}
                  aria-label="Resize guest feeds"
                  onPointerDown={onPipResizePointerDown}
                />
              ) : null}
              {guestFeeds.map((guest) => (
                <div
                  key={guest.identity}
                  className={[
                    "director__guest-tile",
                    !guest.hasCamera ? "is-camera-off" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={
                    {
                      "--avatar-audio-level": normalizeAudioLevel(
                        guestAudioLevels[guest.identity] ?? 0,
                      ),
                    } as CSSProperties
                  }
                >
                  <GuestPipVideo
                    identity={guest.identity}
                    bind={bindGuestVideoEl}
                  />
                  {!guest.hasCamera ? (
                    <div className="director__guest-audio-avatar">
                      <Microphone
                        className="director__guest-audio-avatar__icon"
                        aria-hidden
                      />
                    </div>
                  ) : null}
                  <AudioVolumeIndicator
                    level={guestAudioLevels[guest.identity] ?? 0}
                    className="audio-vu--feed"
                  />
                  <span className="director__guest-label" title={guest.name}>
                    {guest.name}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {avatarRailAnimating ? (
          <div
            ref={avatarRailRef}
            className={[
              "director__entering-avatars",
              avatarRailArming ? "is-arming" : "",
              avatarRailPhase === "poised-out" ? "is-poised-out" : "",
              avatarRailPhase === "poised-in" ? "is-poised-in" : "",
              avatarRailPhase === "sliding-out" ? "is-sliding-out" : "",
              avatarRailPhase === "sliding-in" ? "is-sliding-in" : "",
              avatarRailPhase === "held" ? "is-held" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden
            onAnimationEnd={(event) => {
              const target = event.target as HTMLElement;
              // Per-avatar fade (video + static share the same wrapper animation).
              if (!target.classList.contains("director__entering-avatar")) {
                return;
              }
              // Host avatar is always last — finish once, not once per circle.
              if (target !== event.currentTarget.lastElementChild) return;
              if (avatarRailPhase === "sliding-out") {
                setAvatarRailPhase("off");
                avatarRailAnimGenRef.current += 1;
                return;
              }
              if (avatarRailPhase === "sliding-in") {
                // Keep this rail as the circle UI — no handoff to pip videos.
                setHostCamAnim("audio-only");
                setAvatarRailPhase("held");
              }
            }}
          >
            {avatarRailGuests.map((guest) => (
              <div
                key={guest.identity}
                className="director__entering-avatar"
                style={
                  {
                    "--avatar-audio-level": normalizeAudioLevel(
                      guestAudioLevels[guest.identity] ?? 0,
                    ),
                  } as CSSProperties
                }
              >
                {guest.hasCamera ? (
                  <GuestPipVideo
                    identity={guest.identity}
                    bind={bindEnteringGuestVideoEl}
                    className="director__entering-avatar-video"
                  />
                ) : (
                  <Microphone
                    className="director__entering-avatar-icon"
                    aria-hidden
                  />
                )}
                <span
                  className="director__avatar-name-badge"
                  title={guest.name}
                >
                  {guest.name}
                </span>
              </div>
            ))}
            <div
              className="director__entering-avatar"
              style={
                {
                  "--avatar-audio-level": normalizeAudioLevel(
                    muted ? 0 : hostAudioLevel,
                  ),
                } as CSSProperties
              }
            >
              <img
                className="director__entering-avatar-video"
                src="/host/avatar.png"
                alt=""
              />
              <span className="director__avatar-name-badge" title="You">
                You
              </span>
            </div>
          </div>
        ) : null}
        {waitingCount > 0 || readyCount > 0 ? (
          <div className="director__waiting" aria-label="Visitor status">
            {waitingCount > 0 ? (
              <div className="director__waiting-chip is-waiting">
                <span className="director__waiting-dot" aria-hidden />
                {visitorNotice(waitingCount, "waiting")}
              </div>
            ) : null}
            {readyCount > 0 ? (
              <div className="director__waiting-chip is-ready">
                <span className="director__waiting-dot" aria-hidden />
                {visitorNotice(readyCount, "ready")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      </div>
    </main>
  );
}

export default App;
