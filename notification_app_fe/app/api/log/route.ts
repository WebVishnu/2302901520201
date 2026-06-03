import { Log } from "../../../../logging_middleware/index";
import type { Level, Package } from "../../../../logging_middleware/index";

export async function POST(request: Request) {
  const body = await request.json();
  const level = body.level as Level;
  const pkg = body.pkg as Package;
  const message = body.message as string;

  if (!level || !pkg || !message) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  Log("frontend", level, pkg, message);
  return Response.json({ ok: true });
}
