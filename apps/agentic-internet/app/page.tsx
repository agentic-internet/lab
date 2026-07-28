import { Inspector } from "./Inspector";

export default function Home() {
  return (
    <main className="wrap">
      <section className="hero">
        <span className="badge"><span className="pulse" /> reference shape · v0 · unstable</span>
        <h1>Agents are about to start dealing with other companies&rsquo; agents.</h1>
        <p className="lede">
          Not through a registry or a standard — the way the web already works: an organization publishes,
          at a <span className="k">/.well-known</span> path, a plain description of <b>what it can do</b> and
          <b> on what terms</b>. Another company&rsquo;s agent discovers it and acts. This page hands you the
          smallest concrete version of that shape — and lets you <em>see what an agent sees</em> on any domain.
        </p>
      </section>

      <section id="inspect">
        <Inspector />
      </section>

      <section className="explain">
        <div className="grid">
          <div className="card">
            <h3>Describe, don&rsquo;t register</h3>
            <p>Discovery stays decentralized: an agent reads <span className="k">robots.txt</span>, follows the <span className="k">Agent:</span> line to <span className="k">/.well-known/agent</span>, then each capability. No central directory to join.</p>
          </div>
          <div className="card">
            <h3>Meaning, not a global vocabulary</h3>
            <p>Capability ids are the organization&rsquo;s own local names. A model matches a request to a capability by reading its description — so the semantics stay loose and only a thin envelope is pinned.</p>
          </div>
          <div className="card">
            <h3>v0, on purpose</h3>
            <p>Two independent parties can&rsquo;t interoperate over <em>nothing</em>, so there is a small shape. It is versioned and provisional — a published file carries a <span className="k">spec_version</span> so it can evolve without breaking anyone.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
