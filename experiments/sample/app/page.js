import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <p className="meta">Experiment 3 / sample / Next.js service integration</p>
        <h1>U2SSO sample service</h1>
        <p>
          This experiment exercises the server-owned verification path for signup and login while
          defining a browser message contract for an eventual Chrome extension.
        </p>
        <div className="links">
          <Link className="linkButton" href="/signup">
            Sign up with U2SSO
          </Link>
          <Link className="linkButton secondary" href="/login">
            Log in with U2SSO
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Flow</h2>
          <p className="meta">
            1. The page fetches a server challenge. 2. It asks the extension for a payload using
            `window.postMessage`. 3. The server verifies the payload with the shared logic module.
            4. The demo binds the verified signup to an in-memory account and issues a session on
            login.
          </p>
        </article>
        <article className="panel">
          <h2>Current limitation</h2>
          <p className="meta">
            The extension experiment is not in this workspace yet, so the UI also exposes a demo
            payload button that uses the real logic module on the server. The verification path is
            identical either way.
          </p>
        </article>
      </section>
    </>
  );
}
