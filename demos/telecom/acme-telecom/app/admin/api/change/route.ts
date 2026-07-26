import { changeTariff, ADMIN_TOKEN } from "@/src/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Acme's PRIVATE admin-panel API — how staff (or a pre-arranged partner) change
 * a line by hand. This is not published anywhere: a caller must have been given
 * ADMIN_TOKEN and must already know this endpoint exists. That's the whole point
 * of Demo A — it only works because of a bespoke, prior arrangement.
 */
export async function POST(request: Request) {
  const token = request.headers.get("x-admin-token");
  if (token !== ADMIN_TOKEN) {
    return Response.json({ ok: false, error: "unauthorized (admin panel)" }, { status: 401 });
  }
  const { line_id, target_tariff_id } = await request.json().catch(() => ({}));
  const result = changeTariff(String(line_id), String(target_tariff_id));
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
