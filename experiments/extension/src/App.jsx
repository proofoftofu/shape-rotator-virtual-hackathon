import { useState } from "react";
import {
  DEFAULT_LOGIN_CHALLENGE,
  DEFAULT_REGISTRATION_CHALLENGE,
  DEFAULT_SERVICE_NAME,
  createOrLoadIdentity,
  runExtensionExperiment
} from "./experimentController.js";

function JsonPanel({ label, value }) {
  return (
    <section className="rounded-3xl border border-ink/10 bg-white/70 p-4 shadow-panel backdrop-blur">
      <h2 className="font-display text-lg text-ink">{label}</h2>
      <pre className="mt-3 max-h-52 overflow-auto rounded-2xl bg-ink p-3 text-xs leading-5 text-shell">
        {value ? JSON.stringify(value, null, 2) : "No output yet."}
      </pre>
    </section>
  );
}

export default function App() {
  const [serviceName, setServiceName] = useState(DEFAULT_SERVICE_NAME);
  const [registrationChallenge, setRegistrationChallenge] = useState(DEFAULT_REGISTRATION_CHALLENGE);
  const [loginChallenge, setLoginChallenge] = useState(DEFAULT_LOGIN_CHALLENGE);
  const [identityState, setIdentityState] = useState(null);
  const [registrationPayload, setRegistrationPayload] = useState(null);
  const [loginPayload, setLoginPayload] = useState(null);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  async function withAction(actionLabel, work) {
    setBusyAction(actionLabel);
    setError("");

    try {
      await work();
    } catch (entryError) {
      setError(entryError instanceof Error ? entryError.message : String(entryError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleCreateOrLoadIdentity() {
    await withAction("identity", async () => {
      const result = await createOrLoadIdentity();
      setIdentityState(result);
    });
  }

  async function handleGeneratePayloads(target) {
    await withAction(target, async () => {
      const result = await runExtensionExperiment({
        serviceName,
        registrationChallenge,
        loginChallenge
      });

      setIdentityState({
        created: result.created,
        masterSecretHex: result.masterSecretHex,
        masterSecret: result.masterSecret,
        masterIdentity: result.masterIdentity
      });

      if (target === "registration") {
        setRegistrationPayload(result.registrationPayload);
      } else {
        setLoginPayload(result.loginPayload);
      }
    });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(197,92,59,0.24),_transparent_35%),linear-gradient(160deg,_#f4efe3_0%,_#efe4d0_45%,_#d6c2a1_100%)] px-4 py-5 font-body text-ink">
      <div className="mx-auto w-full max-w-md">
        <section className="rounded-[28px] border border-white/50 bg-shell/80 p-5 shadow-panel backdrop-blur">
          <p className="text-xs uppercase tracking-[0.35em] text-pine/80">Chrome Popup</p>
          <h1 className="mt-2 font-display text-3xl leading-tight text-ink">
            U2SSO vault experiment
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink/75">
            This popup reuses the logic experiment to create or load one master secret and derive
            service-scoped proof payloads inside the extension runtime.
          </p>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.25em] text-pine/80">Service name</span>
              <input
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/20"
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-[0.25em] text-pine/80">
                Registration challenge
              </span>
              <input
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/20"
                value={registrationChallenge}
                onChange={(event) => setRegistrationChallenge(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-[0.25em] text-pine/80">Login challenge</span>
              <input
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/20"
                value={loginChallenge}
                onChange={(event) => setLoginChallenge(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3">
            <button
              className="rounded-2xl bg-pine px-4 py-3 text-sm font-semibold text-shell transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:bg-pine/50"
              disabled={Boolean(busyAction)}
              onClick={handleCreateOrLoadIdentity}
            >
              {busyAction === "identity" ? "Loading identity..." : "Create or load identity"}
            </button>
            <button
              className="rounded-2xl bg-ember px-4 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:bg-ember/50"
              disabled={Boolean(busyAction)}
              onClick={() => handleGeneratePayloads("registration")}
            >
              {busyAction === "registration" ? "Generating registration..." : "Generate registration payload"}
            </button>
            <button
              className="rounded-2xl border border-ink/15 bg-white/70 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Boolean(busyAction)}
              onClick={() => handleGeneratePayloads("login")}
            >
              {busyAction === "login" ? "Generating login..." : "Generate login payload"}
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
              {error}
            </div>
          ) : null}
        </section>

        <div className="mt-4 space-y-4">
          <JsonPanel label="Identity" value={identityState} />
          <JsonPanel label="Registration payload" value={registrationPayload} />
          <JsonPanel label="Login payload" value={loginPayload} />
        </div>
      </div>
    </main>
  );
}
