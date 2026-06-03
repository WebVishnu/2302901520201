import type { Notification, NotificationsResponse } from "./types";

export const PAGE_LIMIT = 10;

export function formatApiError(data: unknown): string {
  if (!data || typeof data !== "object") return "Request failed";
  const obj = data as Record<string, unknown>;
  if (typeof obj.error === "string") return obj.error;
  if (Array.isArray(obj.errors)) {
    const parts = obj.errors.flatMap((e) =>
      typeof e === "object" && e ? Object.values(e as Record<string, string>) : []
    );
    if (parts.length) return parts.join(". ");
  }
  return "Request failed";
}

export async function fetchNotificationsPage(
  page: number,
  notificationType?: string
): Promise<Notification[]> {
  let url = `/api/notifications?page=${page}&limit=${PAGE_LIMIT}`;
  if (notificationType) {
    url += `&notification_type=${notificationType}`;
  }
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(formatApiError(data));
  }
  return (data as NotificationsResponse).notifications ?? [];
}

export async function fetchNotificationsBatch(
  maxPages: number,
  notificationType?: string
): Promise<Notification[]> {
  const all: Notification[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchNotificationsPage(page, notificationType);
    all.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
  }
  return all;
}
