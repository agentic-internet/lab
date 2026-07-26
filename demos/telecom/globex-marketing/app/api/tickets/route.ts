import { listTickets } from "@/src/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listTickets());
}
