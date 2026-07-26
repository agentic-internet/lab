import { runTelecomAgent, type LogEntry } from "@/src/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs the internal agent and streams every log entry as NDJSON, live. */
export async function POST(request: Request) {
  const { subscriber = "Globex Marketing", message = "" } = await request
    .json()
    .catch(() => ({}));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      const onLog = (e: LogEntry) => send(e);

      try {
        await runTelecomAgent({ subscriber, message, onLog });
      } catch (err) {
        send({ channel: "policy", text: `error: ${String(err)}` } satisfies LogEntry);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
