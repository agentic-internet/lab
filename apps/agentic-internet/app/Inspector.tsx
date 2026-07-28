"use client";

import { useState } from "react";

type Status = "ok" | "warn" | "error";
interface Step {
  key: string;
  label: string;
  status: Status;
  detail: string;
  url?: string;
  issues?: string[];
}
interface Result {
  base: string;
  agentUrl: string;
  steps: Step[];
  ok: boolean;
  published_spec?: string;
  expected_spec?: string;
  error?: string;
}

const ICON: Record<Status, string> = { ok: "✓", warn: "!", error: "✕" };
const EXAMPLES = ["acme-telecom.salginci.com", "globex.salginci.com"];

export function Inspector() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(target: string) {
    const d = target.trim();
    if (!d) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch(`/api/inspect?domain=${encodeURIComponent(d)}`);
      const data = (await res.json()) as Result;
      if (data.error) setErr(data.error);
      else setResult(data);
    } catch {
      setErr("Could not reach the inspector. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tool">
      <h2>Inspect a domain</h2>
      <p className="sub">Walk any domain the way an agent would, and see whether what it publishes fits the v0 shape.</p>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          run(domain);
        }}
      >
        <input
          type="text"
          inputMode="url"
          placeholder="example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          aria-label="Domain to inspect"
        />
        <button type="submit" disabled={loading || !domain.trim()}>
          {loading ? "Inspecting…" : "Inspect"}
        </button>
      </form>

      <div className="examples">
        <span>Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setDomain(ex);
              run(ex);
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {loading && <p className="spinner" style={{ marginTop: 18 }}>fetching robots.txt → /.well-known/agent → capabilities…</p>}
      {err && (
        <div className="result">
          <div className="verdict bad">✕ {err}</div>
        </div>
      )}

      {result && !loading && (
        <div className="result">
          <div className={"verdict " + (result.ok ? "ok" : "bad")}>
            {result.ok ? "✓" : "✕"}{" "}
            {result.ok
              ? `${result.base} publishes a discoverable agent that fits the v0 shape`
              : `${result.base} — an agent couldn't fully read this yet`}
          </div>
          {result.steps.map((s) => (
            <div className={"step " + s.status} key={s.key}>
              <div className="head">
                <span className="icon">{ICON[s.status]}</span>
                <span className="label">{s.label}</span>
                {s.url && (
                  <a className="u" href={s.url} target="_blank" rel="noreferrer">
                    {s.url.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
              <div className="detail">{s.detail}</div>
              {s.issues && s.issues.length > 0 && (
                <ul className="issues">
                  {s.issues.map((i, n) => (
                    <li key={n}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
