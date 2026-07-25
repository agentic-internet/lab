import { listHigherTariffs, changeTariff } from "@/src/db";

export const runtime = "nodejs";

/**
 * Acme's outward-facing agent endpoint. Another company's agent calls this to
 * actually use a capability it discovered at /.well-known/agent.
 *
 * Body: { capability: string, input: Record<string, unknown> }
 *
 * This is the execution side of the two capabilities Acme publishes. The
 * downgrade refusal here is Acme's own rule — the caller cannot skip it, which
 * is the whole point of the terms living with the organization.
 */
export async function POST(request: Request) {
  let body: { capability?: string; input?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { capability, input = {} } = body;

  switch (capability) {
    case "telecom.line.tariff.query": {
      const lineId = String(input.line_id ?? "");
      const tariffs = listHigherTariffs(lineId);
      return Response.json({ ok: true, capability, tariffs });
    }

    case "telecom.line.tariff.change": {
      const lineId = String(input.line_id ?? "");
      const target = String(input.target_tariff_id ?? "");
      const result = changeTariff(lineId, target);
      const status = result.ok ? 200 : 409; // 409 = refused (e.g. downgrade)
      return Response.json({ capability, ...result }, { status });
    }

    default:
      return Response.json({ ok: false, error: `unknown capability ${capability}` }, { status: 404 });
  }
}
