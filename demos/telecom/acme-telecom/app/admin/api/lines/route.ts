import { listLines, listTariffs, tariffName } from "@/src/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const lines = listLines().map((l) => ({ ...l, tariff_name: tariffName(l.tariff_id) }));
  return Response.json({ lines, tariffs: listTariffs() });
}
