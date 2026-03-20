import { useEffect, useState } from "react";
import {
  createOrLoadIdentity,
  getStoredIdentity,
  removeStoredIdentity
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

function shorten(value, start = 12, end = 10) {
  if (!value) {
    return "Unavailable";
  }

  if (value.length <= start + end + 3) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export default function App() {
  const [identityState, setIdentityState] = useState(null);
  const [hasStoredIdentity, setHasStoredIdentity] = useState(false);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    let cancelled = false;

    getStoredIdentity()
      .then((storedIdentity) => {
        if (cancelled) {
          return;
        }

        if (storedIdentity) {
          setIdentityState(storedIdentity);
          setHasStoredIdentity(true);
        }
      })
      .catch((readError) => {
        if (!cancelled) {
          setError(readError instanceof Error ? readError.message : String(readError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
      setHasStoredIdentity(true);
    });
  }

  async function handleRemoveIdentity() {
    await withAction("remove-identity", async () => {
      await removeStoredIdentity();
      setIdentityState(null);
      setHasStoredIdentity(false);
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
            This popup creates or loads one master secret, persists it in the extension vault, and
            displays the master public key like a wallet address. The sample app provides the
            service challenge when a sign up or sign in flow starts; the extension only stores the
            vault identity and approves sample requests.
          </p>

          <div className="mt-5 rounded-[28px] border border-ink/10 bg-[linear-gradient(180deg,rgba(16,24,21,0.98),rgba(28,38,35,0.94))] p-5 text-shell shadow-[0_22px_60px_rgba(15,23,22,0.22)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.34em] text-shell/65">
                  Vault address
                </div>
                <div className="mt-2 font-display text-xl text-shell">
                  {identityState ? "Master key active" : "No master key loaded"}
                </div>
              </div>
              <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-emerald-200">
                {hasStoredIdentity ? "Locked" : "Empty"}
              </div>
            </div>
            <div className="mt-5 rounded-3xl border border-white/10 bg-white/6 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.26em] text-shell/60">
                Master public key
              </div>
              <div className="mt-2 break-all font-mono text-sm leading-6 text-shell">
                {identityState?.masterIdentity?.publicKey?.join(",") || "Create a master key to reveal the address"}
              </div>
              {identityState?.masterIdentity?.commitment ? (
                <div className="mt-3 text-xs leading-5 text-shell/70">
                  Commitment: {shorten(identityState.masterIdentity.commitment, 18, 12)}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3">
            {!hasStoredIdentity ? (
              <button
                className="rounded-2xl bg-pine px-4 py-3 text-sm font-semibold text-shell transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:bg-pine/50"
                disabled={Boolean(busyAction)}
                onClick={handleCreateOrLoadIdentity}
              >
                {busyAction === "identity" ? "Creating identity..." : "Create master key"}
              </button>
            ) : (
              <button
                className="rounded-2xl border border-ink/15 bg-white/70 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(busyAction)}
                onClick={handleRemoveIdentity}
              >
                {busyAction === "remove-identity" ? "Removing..." : "Remove master key"}
              </button>
            )}
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
              {error}
            </div>
          ) : null}
        </section>

        <div className="mt-4 space-y-4" />
      </div>
    </main>
  );
}
