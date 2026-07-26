import { runIntake, type LogEntry } from "@/src/agent";
import { pickProvider, consumeRateIfLive } from "@/src/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { subscriber = "Jordan Blake", message = "" } = await request.json().catch(() => ({}));
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      const rate = consumeRateIfLive();
      if (!rate.ok) {
        send({ channel: "policy", text: "daily live-model cap reached — try deterministic mode" } satisfies LogEntry);
        controller.close();
        return;
      }
      const { provider, note } = pickProvider();
      if (note) send({ channel: "policy", text: note } satisfies LogEntry);
      try {
        await runIntake({ subscriber, message, provider, onLog: (e: LogEntry) => send(e) });
      } catch (err) {
        send({ channel: "policy", text: `error: ${String(err)}` } satisfies LogEntry);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" } });
}
