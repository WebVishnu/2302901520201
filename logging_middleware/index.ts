const LOG_URL = "http://4.224.186.213/evaluation-service/logs";

export type Stack = "backend" | "frontend";
export type Level = "debug" | "info" | "warn" | "error" | "fatal";
export type Package =
  | "cache"
  | "controller"
  | "cron_job"
  | "db"
  | "domain"
  | "handler"
  | "repository"
  | "route"
  | "service"
  | "api"
  | "component"
  | "hook"
  | "page"
  | "state"
  | "style"
  | "auth"
  | "config"
  | "middleware"
  | "utils";

function authHeaders(): Record<string, string> {
  const token = (globalThis as { process?: { env?: { EVALUATION_SERVICE_TOKEN?: string } } })
    .process?.env?.EVALUATION_SERVICE_TOKEN;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function Log(
  stack: Stack,
  level: Level,
  pkg: Package,
  message: string
): void {
  fetch(LOG_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      stack,
      level,
      package: pkg,
      message,
    }),
  }).catch(() => {});
}
