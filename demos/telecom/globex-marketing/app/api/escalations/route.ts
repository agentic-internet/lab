import { listEscalations, decideEscalation } from "@/src/escalations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The manager confirmation queue: list, and decide (approve — optionally with a
 *  chosen tariff for agent-to-agent — or reject). */
export function GET() {
  return Response.json(listEscalations());
}

export async function POST(request: Request) {
  const { id, decision = "approve", chosen_tariff_id } = await request.json().catch(() => ({}));
  const e = decideEscalation(String(id), decision === "reject" ? "reject" : "approve", chosen_tariff_id);
  return Response.json(e ?? { error: "not found" }, { status: e ? 200 : 404 });
}
