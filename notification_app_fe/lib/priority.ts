import type { Notification } from "./types";

const WEIGHT: Record<string, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

function parseTime(ts: string) {
  const [date, time] = ts.split(" ");
  return new Date(`${date}T${time}`).getTime();
}

export function rankTopN(list: Notification[], n: number) {
  return [...list]
    .sort((a, b) => {
      const wa = WEIGHT[a.Type] ?? 0;
      const wb = WEIGHT[b.Type] ?? 0;
      if (wa !== wb) return wb - wa;
      return parseTime(b.Timestamp) - parseTime(a.Timestamp);
    })
    .slice(0, n);
}
