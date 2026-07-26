import { getSettings } from "@/src/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, read-only: the current resolution flow, so Operations can show which
 *  way a ticket will be resolved. Changing it is Admin-only (/api/control). */
export function GET() {
  return Response.json({ flow: getSettings().flow });
}
