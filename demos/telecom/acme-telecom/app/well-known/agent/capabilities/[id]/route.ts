import { buildCapability } from "@ail/capability-manifest";
import { CAPABILITIES } from "@/src/data";

export function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(ctx);
}

async function handle(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const found = CAPABILITIES.find((c) => c.id === id);
  if (!found) {
    return Response.json({ error: "unknown capability", id }, { status: 404 });
  }
  return Response.json(buildCapability(found), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
