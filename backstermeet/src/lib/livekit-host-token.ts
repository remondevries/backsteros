import { invoke, isTauri } from "@tauri-apps/api/core";

export type HostTokenResponse = {
  token: string;
  url: string;
  room: string;
};

/** Mint a host JWT — Vite middleware in dev, Tauri command in packaged builds. */
export async function fetchLiveKitHostToken(
  meetingId: string | null,
): Promise<HostTokenResponse> {
  if (isTauri() && import.meta.env.PROD) {
    return invoke<HostTokenResponse>("mint_livekit_host_token", {
      meetingId,
    });
  }

  const qs = meetingId
    ? `?meetingId=${encodeURIComponent(meetingId)}`
    : "";
  const response = await fetch(`/api/livekit-host-token${qs}`);
  const payload = (await response.json()) as HostTokenResponse & {
    error?: string;
  };
  if (!response.ok || !payload.token || !payload.url) {
    throw new Error(payload.error || "Could not mint host token");
  }
  return payload;
}
