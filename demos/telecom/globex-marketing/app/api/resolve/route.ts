import { runResolve, type LogEntry, type ResolveMode } from "@/src/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { ticketId, mode = "agent-to-agent" } = await request.json().catch(() => ({}));
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      try {
        await runResolve({ ticketId, mode: mode as ResolveMode, onLog: (e: LogEntry) => send(e) });
      } catch (err) {
        send({ channel: "policy", text: `error: ${String(err)}` } satisfies LogEntry);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" } });
}
