const KEY = "viewed_notification_ids";

export function getViewedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function markViewed(id: string) {
  const ids = getViewedIds();
  ids.add(id);
  localStorage.setItem(KEY, JSON.stringify([...ids]));
}
