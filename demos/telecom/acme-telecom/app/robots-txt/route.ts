import { buildRobotsTxt } from "@ail/capability-manifest";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const body = buildRobotsTxt({
    agentUrl: `${origin}/.well-known/agent`,
    disallow: ["/admin"],
  });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
