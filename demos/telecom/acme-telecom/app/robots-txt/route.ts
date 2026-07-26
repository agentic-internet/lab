import { buildRobotsTxt } from "@ail/capability-manifest";
import { publicOrigin } from "@/src/origin";

export function GET(request: Request) {
  const origin = publicOrigin(request);
  const body = buildRobotsTxt({
    agentUrl: `${origin}/.well-known/agent`,
    disallow: ["/admin"],
  });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
