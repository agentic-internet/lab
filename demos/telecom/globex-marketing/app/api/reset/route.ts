import { reset as resetTickets } from "@/src/tickets";
import { checkPassword } from "@/src/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-click demo reset: clear Globex tickets and reset Acme's store too. */
export async function POST(request: Request) {
  if (!checkPassword(request.headers.get("x-control-password"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  resetTickets();

  const acme = process.env.ACME_URL ?? "http://localhost:3001";
  let acmeOk = false;
  try {
    const res = await fetch(`${acme}/admin/api/reset`, {
      method: "POST",
      headers: { "x-admin-token": "demo-panel-token" },
    });
    acmeOk = res.ok;
  } catch {
    acmeOk = false;
  }

  return Response.json({ ok: true, acmeReset: acmeOk });
}
