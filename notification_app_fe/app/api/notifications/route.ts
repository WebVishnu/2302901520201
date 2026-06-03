import { getEvaluationToken } from "@/lib/token";

const API = "http://4.224.186.213/evaluation-service/notifications";

export async function GET(request: Request) {
  const token = getEvaluationToken();
  if (!token) {
    return Response.json({ error: "EVALUATION_SERVICE_TOKEN not set" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") ?? "1";
  const rawLimit = Number(searchParams.get("limit") ?? "10");
  const limit = String(Math.min(Math.max(rawLimit || 10, 1), 10));
  const notificationType = searchParams.get("notification_type");

  const url = new URL(API);
  url.searchParams.set("page", page);
  url.searchParams.set("limit", limit);
  if (notificationType) {
    url.searchParams.set("notification_type", notificationType);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ error: text || res.statusText }, { status: res.status });
  }

  return Response.json(await res.json());
}
