/**
 * T3-style chat event bus: fan ACP / activity events to UI subscribers by taskId.
 *
 * Subscribers are disposable WebSocket viewers of ACP sessions. The agent
 * session keeps running when the last viewer disconnects.
 */
import { WebSocket } from "ws";

/** @type {Map<string, Set<import("ws").WebSocket>>} */
const subscribersByTaskId = new Map();

/**
 * @param {string} taskId
 * @param {import("ws").WebSocket} ws
 */
export function registerChatSubscriber(taskId, ws) {
  const id = typeof taskId === "string" ? taskId.trim() : "";
  if (!id || !ws) return;
  let set = subscribersByTaskId.get(id);
  if (!set) {
    set = new Set();
    subscribersByTaskId.set(id, set);
  }
  set.add(ws);
}

/**
 * @param {string} taskId
 * @param {import("ws").WebSocket} ws
 */
export function unregisterChatSubscriber(taskId, ws) {
  const id = typeof taskId === "string" ? taskId.trim() : "";
  if (!id) return;
  const set = subscribersByTaskId.get(id);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) subscribersByTaskId.delete(id);
}

/**
 * @param {import("ws").WebSocket} ws
 */
export function unregisterChatSubscriberSocket(ws) {
  for (const [taskId, set] of subscribersByTaskId) {
    if (!set.has(ws)) continue;
    set.delete(ws);
    if (set.size === 0) subscribersByTaskId.delete(taskId);
  }
}

/**
 * @param {string} taskId
 * @param {Record<string, unknown>} message
 */
export function broadcastChat(taskId, message) {
  const id = typeof taskId === "string" ? taskId.trim() : "";
  if (!id) return;
  const set = subscribersByTaskId.get(id);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(message);
  for (const ws of [...set]) {
    if (ws.readyState !== WebSocket.OPEN) {
      set.delete(ws);
      continue;
    }
    try {
      ws.send(payload);
    } catch {
      set.delete(ws);
    }
  }
  if (set.size === 0) subscribersByTaskId.delete(id);
}

/**
 * @param {string} taskId
 */
export function chatSubscriberCount(taskId) {
  const id = typeof taskId === "string" ? taskId.trim() : "";
  if (!id) return 0;
  return subscribersByTaskId.get(id)?.size ?? 0;
}

export function listChatSubscriptionTaskIds() {
  return [...subscribersByTaskId.keys()];
}

/**
 * Close all chat WebSockets for a task (e.g. agent stop / session delete).
 * @param {string} taskId
 */
export function closeChatSubscribersForTask(taskId) {
  const id = typeof taskId === "string" ? taskId.trim() : "";
  if (!id) return;
  const set = subscribersByTaskId.get(id);
  if (!set) return;
  for (const ws of [...set]) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
  subscribersByTaskId.delete(id);
}
