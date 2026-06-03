type Level = "debug" | "info" | "warn" | "error" | "fatal";
type Pkg =
  | "api"
  | "component"
  | "hook"
  | "page"
  | "state"
  | "auth"
  | "config"
  | "middleware"
  | "utils";

export function clientLog(level: Level, pkg: Pkg, message: string) {
  fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, pkg, message }),
  }).catch(() => {});
}
