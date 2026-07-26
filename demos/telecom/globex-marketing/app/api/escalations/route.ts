import { listEscalations, approveEscalation } from "@/src/escalations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The manager confirmation queue: list pending/approved, and approve one. */
export function GET() {
  return Response.json(listEscalations());
}

export async function POST(request: Request) {
  const { id } = await request.json().catch(() => ({}));
  const e = approveEscalation(String(id));
  return Response.json(e ?? { error: "not found" }, { status: e ? 200 : 404 });
}
