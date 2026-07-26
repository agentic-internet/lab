import { runOpsChat, runOpsChatA2A, type LogEntry } from "@/src/agent";
import { pickProvider, consumeRateIfLive, getSettings } from "@/src/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The operations assistant (agent→human): escalate to a manager, then close. */
export async function POST(request: Request) {
  const { ticketId, message = "", history = [] } = await request.json().catch(() => ({}));
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
        const run = getSettings().flow === "agent-to-agent" ? runOpsChatA2A : runOpsChat;
        await run({ ticketId, message, history, provider, onLog: (e: LogEntry) => send(e) });
      } catch (err) {
        send({ channel: "policy", text: `error: ${String(err)}` } satisfies LogEntry);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" } });
}
