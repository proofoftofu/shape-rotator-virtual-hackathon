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

    </>
  );
}
