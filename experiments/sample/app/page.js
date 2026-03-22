import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <p className="meta">U2SSO Pass</p>
        <h1>Identity for modern services</h1>
        <p>
          U2SSO Pass keeps a single vault in the browser and turns it into service-specific
          identities for sign up and sign in.
        </p>
        <div className="links">
          <Link className="linkButton" href="/signup">
            Sign up
          </Link>
          <Link className="linkButton secondary" href="/login">
            Sign in
          </Link>
        </div>
      </section>
      <section className="panel installPanel">
        <div className="referenceBlock">
          <p className="eyebrow">Overview reference</p>
          <h2>Chrome extension version of Anonymous Self-Credentials &amp; SSO</h2>
          <p className="meta">
            Based on the paper{" "}
            <Link
              className="referenceLink"
              href="https://eprint.iacr.org/2025/618.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Anonymous Self-Credentials &amp; SSO
            </Link>{" "}
            and using{" "}
            <Link
              className="referenceLink"
              href="https://github.com/BoquilaID/U2SSO"
              target="_blank"
              rel="noreferrer"
            >
              BoquilaID/U2SSO
            </Link>{" "}
            as the implementation reference.
          </p>
        </div>
      </section>
    </>
  );
}
