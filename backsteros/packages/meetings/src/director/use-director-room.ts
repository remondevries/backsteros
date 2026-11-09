/**
 * Director media-session facade.
 *
 * Today this is LiveKit (`useDirectorLiveKit`). A future Cloudflare RealtimeKit
 * (or other) provider should implement the same hook surface here so
 * {@link DirectorRoom} does not need UI changes — only this module swaps.
 */
export {
  useDirectorLiveKit as useDirectorRoom,
  visitorNotice,
  type GuestFeed,
  type GuestPhase,
} from "./use-director-livekit";
