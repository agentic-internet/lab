import { reset, ADMIN_TOKEN } from "@/src/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reset Acme's lines + tariffs to seed. Token-gated, for repeat demos. */
export async function POST(request: Request) {
  if (request.headers.get("x-admin-token") !== ADMIN_TOKEN) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  reset();
  return Response.json({ ok: true });
}
