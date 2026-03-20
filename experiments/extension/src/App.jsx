import { useEffect, useState } from "react";
import { createExtensionResponse } from "./messageBridge.js";
import {
  createOrLoadIdentity,
  getStoredChildCredentials,
  getStoredIdentity,
  previewChildCredential,
  saveStoredChildCredential,
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
  const searchParams = new URLSearchParams(window.location.search);
  const approvalRequestId = searchParams.get("requestId");
  const isApprovalMode = searchParams.get("mode") === "approval" && Boolean(approvalRequestId);
  const [activeTab, setActiveTab] = useState("main");

  const [identityState, setIdentityState] = useState(null);
  const [hasStoredIdentity, setHasStoredIdentity] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [approvalChildCredential, setApprovalChildCredential] = useState(null);
  const [childCredentials, setChildCredentials] = useState([]);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const hasServices = childCredentials.length > 0;

  useEffect(() => {
    let cancelled = false;

    Promise.all([getStoredIdentity(), getStoredChildCredentials()])
      .then(([storedIdentity, storedChildCredentials]) => {
        if (cancelled) {
          return;
        }

        if (storedIdentity) {
          setIdentityState(storedIdentity);
          setHasStoredIdentity(true);
        }

        setChildCredentials(storedChildCredentials || []);
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

  useEffect(() => {
    if (!hasStoredIdentity) {
      setActiveTab("main");
    }
  }, [hasStoredIdentity]);

  useEffect(() => {
    if (!isApprovalMode) {
      return undefined;
    }

    let cancelled = false;

    runtimeMessage({
      requestId: approvalRequestId,
      type: "u2sso:getPendingRequest"
    })
      .then((result) => {
        if (!cancelled) {
          setPendingRequest(result?.request || null);
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
  }, [approvalRequestId, isApprovalMode]);

  useEffect(() => {
    if (!isApprovalMode || !pendingRequest || !identityState?.masterSecret) {
      setApprovalChildCredential(null);
      return undefined;
    }

    let cancelled = false;

    previewChildCredential(identityState.masterSecret, pendingRequest.serviceName)
      .then((childCredential) => {
        if (!cancelled) {
          setApprovalChildCredential(childCredential);
        }
      })
      .catch((previewError) => {
        if (!cancelled) {
          setError(previewError instanceof Error ? previewError.message : String(previewError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [approvalRequestId, identityState?.masterSecret, isApprovalMode, pendingRequest]);

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
      setChildCredentials([]);
      setActiveTab("main");
    });
  }

  async function handleApproveRequest() {
    if (!pendingRequest) {
      return;
    }

    await withAction("approve-request", async () => {
      const response = await createExtensionResponse(pendingRequest);
      if (pendingRequest.flow === "signup") {
        await saveStoredChildCredential(
          {
            spkCommitment: approvalChildCredential?.spkCommitment || response.payload?.spkCommitment,
            spkPublicKey: approvalChildCredential?.spkPublicKey || response.payload?.spkPublicKey,
            serviceName: pendingRequest.serviceName
          }
        );
        setChildCredentials((current) => {
          const nextEntries = current.filter((entry) => entry.serviceName !== pendingRequest.serviceName);
          nextEntries.unshift({
            commitment: approvalChildCredential?.spkCommitment || response.payload?.spkCommitment,
            publicKey: approvalChildCredential?.spkPublicKey || response.payload?.spkPublicKey,
            serviceName: pendingRequest.serviceName
          });
          return nextEntries.slice(0, 5);
        });
      }
      await runtimeMessage({
        requestId: pendingRequest.requestId,
        response,
        type: "u2sso:approveRequest"
      });
      setPendingRequest(null);
      window.setTimeout(() => window.close(), 50);
    });
  }

  async function handleRejectRequest() {
    if (!pendingRequest) {
      return;
    }

    await withAction("reject-request", async () => {
      await runtimeMessage({
        reason: "Request rejected from approval popup",
        requestId: pendingRequest.requestId,
        type: "u2sso:rejectRequest"
      });
      setPendingRequest(null);
      window.setTimeout(() => window.close(), 50);
    });
  }

  async function runtimeMessage(message) {
    if (typeof chrome === "undefined" || !chrome.runtime) {
      throw new Error("Chrome runtime unavailable");
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (result) => {
        const lastError = chrome.runtime.lastError;

        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        if (result?.error) {
          reject(new Error(result.error));
          return;
        }

        resolve(result);
      });
    });
  }

  if (isApprovalMode) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(197,92,59,0.24),_transparent_35%),linear-gradient(160deg,_#f4efe3_0%,_#efe4d0_45%,_#d6c2a1_100%)] px-4 py-5 font-body text-ink">
        <div className="mx-auto w-full max-w-md">
          <section className="rounded-[28px] border border-ink/10 bg-[linear-gradient(180deg,rgba(16,24,21,0.98),rgba(28,38,35,0.94))] p-5 text-shell shadow-[0_22px_60px_rgba(15,23,22,0.22)]">
            <div className="text-[11px] uppercase tracking-[0.34em] text-shell/65">
              Approval request
            </div>
            <div className="mt-2 font-display text-xl text-shell">
              {pendingRequest ? `Review ${pendingRequest.flow}` : "Loading request"}
            </div>
            <div className="mt-4 rounded-3xl border border-white/10 bg-white/6 px-4 py-4 text-sm leading-6 text-shell/85">
              <div>Service: {pendingRequest?.serviceName || "Loading..."}</div>
              <div className="mt-1">Origin: {pendingRequest?.origin || "Loading..."}</div>
              <div className="mt-1">Challenge: {pendingRequest?.challenge || "Loading..."}</div>
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.26em] text-shell/60">
                  Child public key
                </div>
                <div className="mt-2 break-all font-mono text-xs leading-5 text-shell">
                  {approvalChildCredential?.spkPublicKey ||
                    childCredentials.find((entry) => entry.serviceName === pendingRequest?.serviceName)?.publicKey ||
                    "Load master key and approve signup first"}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                className="rounded-2xl border border-white/15 bg-white/6 px-4 py-3 text-sm font-semibold text-shell transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(busyAction) || !pendingRequest}
                onClick={handleRejectRequest}
              >
                {busyAction === "reject-request" ? "Rejecting..." : "Reject"}
              </button>
              <button
                className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(busyAction) || !pendingRequest}
                onClick={handleApproveRequest}
              >
                {busyAction === "approve-request" ? "Approving..." : "Approve"}
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!hasStoredIdentity) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(197,92,59,0.24),_transparent_35%),linear-gradient(160deg,_#f4efe3_0%,_#efe4d0_45%,_#d6c2a1_100%)] px-4 py-5 font-body text-ink">
        <div className="mx-auto w-full max-w-md">
          <section className="rounded-[28px] border border-white/50 bg-shell/80 p-5 shadow-panel backdrop-blur">
            <p className="text-xs uppercase tracking-[0.35em] text-pine/80">Chrome Popup</p>
            <h1 className="mt-2 font-display text-3xl leading-tight text-ink">
              U2SSO vault experiment
            </h1>
            <p className="mt-3 text-sm leading-6 text-ink/75">
              This popup creates or loads one master secret, persists it in the extension vault,
              and displays the master public key like a wallet address. The sample app provides the
              service challenge when a sign up or sign in flow starts; the extension only stores the
              vault identity and approves sample requests.
            </p>
            <div className="mt-5 rounded-[28px] border border-ink/10 bg-[linear-gradient(180deg,rgba(16,24,21,0.98),rgba(28,38,35,0.94))] p-5 text-shell shadow-[0_22px_60px_rgba(15,23,22,0.22)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.34em] text-shell/65">
                    Vault address
                  </div>
                  <div className="mt-2 font-display text-xl text-shell">Setup</div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-shell/60">
                  Setup
                </div>
              </div>
              <div className="mt-5 rounded-3xl border border-white/10 bg-white/6 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.26em] text-shell/60">
                  Master public key
                </div>
                <div className="mt-2 break-all font-mono text-sm leading-6 text-shell">
                  Create a master key to reveal the address
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3">
              <button
                className="rounded-2xl bg-pine px-4 py-3 text-sm font-semibold text-shell transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:bg-pine/50"
                disabled={Boolean(busyAction)}
                onClick={handleCreateOrLoadIdentity}
              >
                {busyAction === "identity" ? "Creating identity..." : "Create master key"}
              </button>
            </div>
            {error ? (
              <div className="mt-4 rounded-2xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
                {error}
              </div>
            ) : null}
          </section>
        </div>
      </main>
    );
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
            This popup keeps one persistent master key in the extension vault. Main shows the
            master vault status; Services shows the saved service-specific child accounts.
          </p>

          <section className="mt-5 rounded-[28px] border border-white/50 bg-shell/80 p-5 shadow-panel backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-white/70 p-1 text-sm text-ink">
                <button
                  className={`rounded-full px-4 py-2 transition ${
                    activeTab === "main"
                      ? "bg-pine text-shell shadow-sm"
                      : "text-ink/70 hover:text-ink"
                  }`}
                  onClick={() => setActiveTab("main")}
                  type="button"
                >
                  Main
                </button>
                <button
                  className={`rounded-full px-4 py-2 transition ${
                    activeTab === "services"
                      ? "bg-pine text-shell shadow-sm"
                      : "text-ink/70 hover:text-ink"
                  }`}
                  onClick={() => setActiveTab("services")}
                  type="button"
                >
                  Services
                </button>
              </div>
              <div className="text-right text-xs uppercase tracking-[0.28em] text-pine/70">
                {hasServices ? `${childCredentials.length} saved` : "No services yet"}
              </div>
            </div>

            {activeTab === "main" ? (
              <div className="mt-5 rounded-3xl border border-ink/10 bg-white/50 px-4 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-pine/80">Vault address</p>
                    <h2 className="mt-2 font-display text-2xl text-ink">Master vault</h2>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-emerald-200">
                    Secured
                  </div>
                </div>
                <div className="mt-4 rounded-3xl border border-ink/10 bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-pine/70">
                    Master public key
                  </div>
                  <div className="mt-2 break-all font-mono text-sm leading-6 text-ink">
                    {identityState?.masterIdentity?.publicKey?.join(",")}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink/75">
                  This is the persistent root credential stored in the extension. Create it once,
                  use it across services, and remove it only when you want to start a new vault.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  <button
                    className="rounded-2xl border border-ink/15 bg-white/70 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={Boolean(busyAction)}
                    onClick={handleRemoveIdentity}
                  >
                    {busyAction === "remove-identity" ? "Removing..." : "Remove master key"}
                  </button>
                </div>
              </div>
            ) : null}

            {activeTab === "services" ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm leading-6 text-ink/75">
                  Approved signups create one service-specific child public key here. The list
                  behaves like a password manager for service accounts.
                </p>
                {childCredentials.length > 0 ? (
                  childCredentials.map((entry) => (
                    <div
                      className="rounded-3xl border border-ink/10 bg-[linear-gradient(180deg,rgba(16,24,21,0.98),rgba(28,38,35,0.94))] p-4 text-shell shadow-[0_18px_40px_rgba(15,23,22,0.16)]"
                      key={entry.serviceName}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.26em] text-shell/55">
                            {entry.serviceName}
                          </div>
                          <div className="mt-1 text-sm text-shell/80">Service credential</div>
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-shell/60">
                          Saved
                        </div>
                      </div>
                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-shell/55">
                          Public key
                        </div>
                        <div className="mt-2 break-all font-mono text-xs leading-5 text-shell">
                          {entry.publicKey}
                        </div>
                      </div>
                      {entry.commitment ? (
                        <div className="mt-3 text-xs leading-5 text-shell/65">
                          Commitment: {shorten(entry.commitment, 14, 10)}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-ink/15 bg-white/50 px-4 py-6 text-sm leading-6 text-ink/70">
                    No service credentials yet. Approve a signup request to save one.
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}
