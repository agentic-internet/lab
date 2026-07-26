/**
 * The public origin of this site, correct behind a reverse proxy.
 * Preference: PUBLIC_URL env (e.g. https://acme-telecom.salginci.com), then the
 * X-Forwarded-* headers a proxy sets, then the raw request origin (local dev).
 */
export function publicOrigin(request: Request): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
