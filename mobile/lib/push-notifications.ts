import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import type { BacksterosApiClient } from "@backsteros/api-client";
import { createApiClient } from "@backsteros/api-client";
import type {
  AgentAttentionNotificationPayload,
  InboxTriageNotificationPayload,
} from "@backsteros/contracts";

import { getMobileEnvironment } from "./env";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const registeredTokens = new Set<string>();
const recentKeys = new Set<string>();

export function noteMobileInboxTriageNotificationShown(key: string): void {
  recentKeys.add(key);
}

export function wasMobileInboxTriageNotificationShown(key: string): boolean {
  return recentKeys.has(key);
}

export function mapInboxTriageHrefToMobileRoute(href: string): string {
  if (href.startsWith("/email/")) {
    const match = href.match(/^\/email\/([^/]+)\/([^/?]+)/);
    if (match) {
      return `/(app)/inbox/email/${encodeURIComponent(match[1]!)}/${encodeURIComponent(match[2]!)}`;
    }
  }
  if (href.startsWith("/calendar/meetings/")) {
    const match = href.match(/^\/calendar\/meetings\/([^/?]+)/);
    if (match?.[1]) {
      return `/meeting/${encodeURIComponent(match[1])}`;
    }
  }
  if (href.startsWith("/inbox/")) {
    const slug = href.slice("/inbox/".length).split("?")[0];
    if (slug) return `/(app)/inbox/${slug}`;
  }
  return "/(app)/inbox";
}

async function registerPushTokenWithApi(
  client: BacksterosApiClient,
  token: string,
): Promise<void> {
  if (registeredTokens.has(token)) return;
  await client.requestJson("/api/v1/devices/push-token", {
    method: "PUT",
    body: JSON.stringify({
      platform: Platform.OS === "ios" ? "ios" : "android",
      token,
      deviceName: Device.modelName ?? Device.deviceName ?? undefined,
    }),
  });
  registeredTokens.add(token);
}

export async function registerMobilePushNotifications(input: {
  client: BacksterosApiClient;
  getToken?: () => Promise<string | null>;
}): Promise<string | null> {
  const { client } = input;
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const projectId =
    Notifications.getExpoPushTokenAsync.length > 0
      ? undefined
      : undefined;
  const tokenResult = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const token = tokenResult.data?.trim();
  if (!token) return null;

  const { localApiUrl, cloudApiUrl } = getMobileEnvironment();
  await registerPushTokenWithApi(client, token);

  if (cloudApiUrl && cloudApiUrl !== localApiUrl) {
    try {
      const cloudClient = createApiClient({
        baseUrl: cloudApiUrl,
        getToken: input.getToken,
      });
      await registerPushTokenWithApi(cloudClient, token);
    } catch {
      // Cloud registration is best-effort for portal bookings when Mac is offline.
    }
  }

  return token;
}

export async function unregisterMobilePushNotifications(
  client: BacksterosApiClient,
  token: string,
): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;
  await client.requestJson("/api/v1/devices/push-token", {
    method: "DELETE",
    body: JSON.stringify({ token: trimmed }),
  });
  registeredTokens.delete(trimmed);
}

export async function showMobileInboxTriageNotification(
  payload: InboxTriageNotificationPayload,
): Promise<void> {
  return showMobileWorkspaceNotification(payload);
}

export async function showMobileWorkspaceNotification(payload: {
  key: string;
  kind: string;
  title: string;
  body: string;
  href: string;
}): Promise<void> {
  if (wasMobileInboxTriageNotificationShown(payload.key)) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: payload.title,
      body: payload.body,
      data: {
        key: payload.key,
        kind: payload.kind,
        href: payload.href,
      },
    },
    trigger: null,
  });
  noteMobileInboxTriageNotificationShown(payload.key);
}

export async function showMobileAgentAttentionNotification(
  payload: AgentAttentionNotificationPayload,
): Promise<void> {
  return showMobileWorkspaceNotification(payload);
}

export function useMobilePushNotificationNavigation(): void {
  const router = useRouter();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const openFromResponse = (
      response: Notifications.NotificationResponse | null | undefined,
    ) => {
      const href = response?.notification.request.content.data?.href;
      if (typeof href !== "string" || !href.trim()) return;
      const key = response?.notification.request.content.data?.key;
      const dedupeKey =
        typeof key === "string" ? key : `${href}:${response?.actionIdentifier}`;
      if (handledRef.current === dedupeKey) return;
      handledRef.current = dedupeKey;
      router.push(mapInboxTriageHrefToMobileRoute(href) as never);
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => openFromResponse(response),
    );

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      openFromResponse(response);
    });

    return () => subscription.remove();
  }, [router]);
}

export function useRegisterMobilePushNotifications(
  client: BacksterosApiClient | null,
  enabled: boolean,
  getToken?: () => Promise<string | null>,
): void {
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !client) return;
    let cancelled = false;

    void (async () => {
      try {
        const token = await registerMobilePushNotifications({
          client,
          getToken,
        });
        if (!cancelled) tokenRef.current = token;
      } catch (error) {
        console.warn(
          "push registration failed:",
          error instanceof Error ? error.message : error,
        );
      }
    })();

    return () => {
      cancelled = true;
      const token = tokenRef.current;
      tokenRef.current = null;
      if (token && client) {
        void unregisterMobilePushNotifications(client, token).catch(() => {});
      }
    };
  }, [client, enabled, getToken]);
}
