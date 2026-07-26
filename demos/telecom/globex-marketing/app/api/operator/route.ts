export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Demo A's bespoke path, server-side. Globex was handed a token and told the
 * operator's private admin API exists — no discovery. We proxy it here so the
 * Admin screen can show (and, by hand, change) the operator's lines and packages
 * for verification, without the browser hitting a cross-origin wall.
 */
const ACME = process.env.ACME_URL ?? "http://localhost:3001";
const ADMIN_TOKEN = "demo-panel-token"; // the pre-arranged partner token

export async function GET() {
  try {
    const view = await fetch(`${ACME}/admin/api/lines`, { cache: "no-store" }).then((r) => r.json());
    return Response.json(view);
  } catch (e) {
    return Response.json({ lines: [], tariffs: [], error: String(e) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const { line_id, target_tariff_id } = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${ACME}/admin/api/change`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": ADMIN_TOKEN },
      body: JSON.stringify({ line_id, target_tariff_id }),
    });
    const body = await res.json().catch(() => ({}));
    return Response.json(body, { status: res.status });
  } catch (e) {
    return Response.json({ ok: false, reason: String(e) }, { status: 502 });
  }
}
