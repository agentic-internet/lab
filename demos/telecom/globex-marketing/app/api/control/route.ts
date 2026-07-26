import { publicSettings, updateSettings, checkPassword, type Settings } from "@/src/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authed(request: Request): boolean {
  return checkPassword(request.headers.get("x-control-password"));
}

export function GET(request: Request) {
  if (!authed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(publicSettings());
}

export async function POST(request: Request) {
  if (!authed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const patch = (await request.json().catch(() => ({}))) as Partial<Settings>;
  const allowed: Partial<Settings> = {};
  if (patch.flow === "agent-to-agent" || patch.flow === "agent-to-human") allowed.flow = patch.flow;
  if (patch.mode === "deterministic" || patch.mode === "live") allowed.mode = patch.mode;
  if (patch.provider === "anthropic" || patch.provider === "deepseek") allowed.provider = patch.provider;
  if (typeof patch.model === "string") allowed.model = patch.model;
  if (typeof patch.dailyCap === "number") allowed.dailyCap = Math.max(0, Math.floor(patch.dailyCap));
  updateSettings(allowed);
  return Response.json(publicSettings());
}
