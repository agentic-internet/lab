import { OrgManifest, Capability, SPEC_VERSION } from "@ail/shared";
import { parseAgentLine } from "@ail/capability-client";
import { WELL_KNOWN } from "@ail/capability-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The validator: given a bare domain, walk it exactly the way an agent would —
 * /robots.txt → the Agent: line → /.well-known/agent → each capability — and
 * report, at every step, what an agent actually sees and whether it fits the
 * (v0, unstable) reference shape. Forgiving on purpose: it reports problems
 * instead of throwing, because telling a publisher what's wrong is the point.
 */

type Status = "ok" | "warn" | "error";
interface Step {
  key: string;
  label: string;
  status: Status;
  detail: string;
  url?: string;
  issues?: string[];
}

function root(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function getText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, text: String(err instanceof Error ? err.message : err) };
  }
}

function zodIssues(err: { issues: { path: (string | number)[]; message: string }[] }): string[] {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain")?.trim();
  if (!domain) return Response.json({ error: "pass ?domain=" }, { status: 400 });

  const base = root(domain);
  const steps: Step[] = [];
  let manifestData: unknown = null;
  const capabilities: unknown[] = [];
  let publishedSpec: string | undefined;

  // 1) robots.txt → the Agent: line
  const robotsUrl = `${base}${WELL_KNOWN.robots}`;
  const robots = await getText(robotsUrl);
  let agentUrl: string;
  if (robots.ok) {
    const line = parseAgentLine(robots.text);
    if (line) {
      agentUrl = /^https?:\/\//.test(line) ? line : new URL(line, base).toString();
      steps.push({ key: "robots", label: "robots.txt → Agent:", status: "ok", detail: `Agent: ${agentUrl}`, url: robotsUrl });
    } else {
      agentUrl = `${base}${WELL_KNOWN.agent}`;
      steps.push({ key: "robots", label: "robots.txt → Agent:", status: "warn", detail: `no "Agent:" line — falling back to ${WELL_KNOWN.agent}`, url: robotsUrl });
    }
  } else {
    agentUrl = `${base}${WELL_KNOWN.agent}`;
    steps.push({ key: "robots", label: "robots.txt → Agent:", status: "warn", detail: `no robots.txt (${robots.status || "unreachable"}) — trying ${WELL_KNOWN.agent} directly`, url: robotsUrl });
  }

  // 2) the manifest at /.well-known/agent
  const manifestRes = await getText(agentUrl);
  if (!manifestRes.ok) {
    steps.push({ key: "manifest", label: "/.well-known/agent", status: "error", detail: `not reachable (${manifestRes.status || manifestRes.text})`, url: agentUrl });
    return Response.json({ base, agentUrl, steps, ok: false, expected_spec: SPEC_VERSION });
  }
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestRes.text);
  } catch {
    steps.push({ key: "manifest", label: "/.well-known/agent", status: "error", detail: "served, but not valid JSON", url: agentUrl });
    return Response.json({ base, agentUrl, steps, ok: false, expected_spec: SPEC_VERSION });
  }
  const parsed = OrgManifest.safeParse(manifestJson);
  if (!parsed.success) {
    steps.push({ key: "manifest", label: "/.well-known/agent", status: "error", detail: "valid JSON, but does not fit the manifest shape", url: agentUrl, issues: zodIssues(parsed.error) });
    return Response.json({ base, agentUrl, steps, ok: false, raw_manifest: manifestJson, expected_spec: SPEC_VERSION });
  }
  const manifest = parsed.data;
  manifestData = manifest;
  publishedSpec = manifest.spec_version;
  const specNote = publishedSpec === SPEC_VERSION ? "" : ` · declares spec ${publishedSpec}, this validator is ${SPEC_VERSION}`;
  steps.push({
    key: "manifest",
    label: "/.well-known/agent",
    status: "ok",
    detail: `${manifest.organization.name} — ${manifest.capabilities.length} capabilit${manifest.capabilities.length === 1 ? "y" : "ies"}${specNote}`,
    url: agentUrl,
  });

  // 3) each capability
  for (const ref of manifest.capabilities) {
    const capUrl = /^https?:\/\//.test(ref.detail) ? ref.detail : new URL(ref.detail, base).toString();
    const capRes = await getText(capUrl);
    if (!capRes.ok) {
      steps.push({ key: `cap:${ref.id}`, label: `capability · ${ref.id}`, status: "error", detail: `not reachable (${capRes.status || capRes.text})`, url: capUrl });
      continue;
    }
    let capJson: unknown;
    try {
      capJson = JSON.parse(capRes.text);
    } catch {
      steps.push({ key: `cap:${ref.id}`, label: `capability · ${ref.id}`, status: "error", detail: "served, but not valid JSON", url: capUrl });
      continue;
    }
    const capParsed = Capability.safeParse(capJson);
    if (!capParsed.success) {
      steps.push({ key: `cap:${ref.id}`, label: `capability · ${ref.id}`, status: "error", detail: "valid JSON, but does not fit the capability shape", url: capUrl, issues: zodIssues(capParsed.error) });
      continue;
    }
    const c = capParsed.data;
    capabilities.push(c);
    steps.push({
      key: `cap:${ref.id}`,
      label: `capability · ${ref.id}`,
      status: "ok",
      detail: `“${c.title}” — outcome: ${c.semantics.outcome} · costs_money: ${c.terms.costs_money} · reversible: ${c.terms.reversible}`,
      url: capUrl,
    });
  }

  const ok = steps.every((s) => s.status !== "error");
  return Response.json({ base, agentUrl, steps, ok, manifest: manifestData, capabilities, published_spec: publishedSpec, expected_spec: SPEC_VERSION });
}
