import { useEffect, useState } from "react";
import { createExtensionResponse } from "./messageBridge.js";
import {
  DEFAULT_REGISTRY_ORIGIN,
  createOrLoadIdentity,
  getStoredChildCredentials,
  getStoredMasterRegistrationState,
  getStoredIdentity,
  previewChildCredential,
  saveStoredChildCredential,
  saveStoredMasterRegistrationState,
  removeStoredIdentity
} from "./experimentController.js";

function JsonPanel({ label, value }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-panel backdrop-blur">
      <h2 className="font-display text-lg text-slate-100">{label}</h2>
      <pre className="mt-3 max-h-52 overflow-auto rounded-2xl bg-slate-950/80 p-3 text-xs leading-5 text-slate-100">
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
  const [masterRegistrationState, setMasterRegistrationState] = useState(null);
  const [registryEntries, setRegistryEntries] = useState([]);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [approvalChildCredential, setApprovalChildCredential] = useState(null);
  const [childCredentials, setChildCredentials] = useState([]);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [creationFx, setCreationFx] = useState(false);
  const hasServices = childCredentials.length > 0;

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getStoredIdentity(),
      getStoredChildCredentials(),
      getStoredMasterRegistrationState()
    ])
      .then(([storedIdentity, storedChildCredentials, storedRegistrationState]) => {
        if (cancelled) {
          return;
        }

        if (storedIdentity) {
          setIdentityState(storedIdentity);
          setHasStoredIdentity(true);
        }

        setChildCredentials(storedChildCredentials || []);
        setMasterRegistrationState(storedRegistrationState || null);
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
      setCreationFx(true);
      const result = await createOrLoadIdentity();
      setIdentityState(result);
      setHasStoredIdentity(true);
      setMasterRegistrationState({
        phase: "created",
        message: "Vault created. Registering the vault on-chain..."
      });
      try {
        const registrationResponse = await fetch(
          new URL("/api/master-identity", DEFAULT_REGISTRY_ORIGIN).toString(),
          {
            body: JSON.stringify({ masterIdentity: result.masterIdentity }),
            headers: {
              "Content-Type": "application/json"
            },
            method: "POST"
          }
        );

        const registration = await registrationResponse.json();
        console.log("[u2sso-extension] master identity registration response", {
          body: registration,
          ok: registrationResponse.ok,
          origin: DEFAULT_REGISTRY_ORIGIN,
          status: registrationResponse.status
        });

        if (!registrationResponse.ok) {
          throw new Error(registration.error || "Master identity registration failed");
        }

        const nextState = {
          phase: "registered",
          message: "Registered"
        };
        setMasterRegistrationState(nextState);
        await saveStoredMasterRegistrationState(nextState);
        const registryResponse = await fetch(new URL("/api/master-identity", DEFAULT_REGISTRY_ORIGIN).toString());
        const registryBody = await registryResponse.json();
        console.log("[u2sso-extension] loaded registry entries", {
          count: Array.isArray(registryBody.identities) ? registryBody.identities.length : 0,
          identities: registryBody.identities
        });
        if (registryResponse.ok) {
          setRegistryEntries(Array.isArray(registryBody.identities) ? registryBody.identities : []);
        }
      } finally {
        setCreationFx(false);
      }
    });
  }

  async function handleRemoveIdentity() {
    await withAction("remove-identity", async () => {
      await removeStoredIdentity();
      setIdentityState(null);
      setHasStoredIdentity(false);
      setMasterRegistrationState(null);
      await saveStoredMasterRegistrationState(null);
      setChildCredentials([]);
      setActiveTab("main");
    });
  }

  async function handleApproveRequest() {
    if (!pendingRequest) {
      return;
    }

    await withAction("approve-request", async () => {
      if (masterRegistrationState?.phase !== "registered") {
        throw new Error("Master identity must be registered on-chain before sign-in.");
      }

      let nextRegistryEntries = registryEntries;
      const registryResponse = await fetch(
        new URL("/api/master-identity", DEFAULT_REGISTRY_ORIGIN).toString()
      );
      const registryBody = await registryResponse.json();

      if (!registryResponse.ok) {
        throw new Error(registryBody.error || "Failed to load registry identities");
      }

      nextRegistryEntries = Array.isArray(registryBody.identities) ? registryBody.identities : [];
      setRegistryEntries(nextRegistryEntries);

      if (!Array.isArray(nextRegistryEntries) || nextRegistryEntries.length === 0) {
        throw new Error("No registered master identities are available yet.");
      }

      console.log("[u2sso-extension] approving request with registry entries", {
        count: nextRegistryEntries.length,
        requestId: pendingRequest.requestId,
        serviceName: pendingRequest.serviceName
      });

      const response = await createExtensionResponse(pendingRequest, {
        experimentOptions: {
          masterSecret: identityState?.masterSecret,
          registryEntries: nextRegistryEntries
        }
      });
      console.log("[u2sso-extension] approval response created", {
        flow: response.flow,
        requestId: response.requestId,
        hasPayload: Boolean(response.payload),
        keys: response.payload ? Object.keys(response.payload) : []
      });
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
      console.log("[u2sso-extension] approval delivered to sample", {
        requestId: pendingRequest.requestId,
        flow: pendingRequest.flow
      });
      setPendingRequest(null);
      window.close();
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
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_28%),radial-gradient(circle_at_20%_20%,_rgba(16,185,129,0.08),_transparent_24%),linear-gradient(180deg,_#0a0f14_0%,_#0b1117_55%,_#070a0f_100%)] px-4 py-5 font-body text-slate-100">
        <div className="mx-auto w-full max-w-md">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl u2sso-animate-fade-up">
            <div className="text-[11px] uppercase tracking-[0.34em] text-slate-400">
              Review request
            </div>
            <div className="mt-2 font-display text-xl text-slate-100">
              {pendingRequest ? `${pendingRequest.flow === "signup" ? "Sign up" : "Sign in"} approval` : "Loading request"}
            </div>
            <div className="mt-5 rounded-[22px] border border-white/10 bg-slate-950/70 px-4 py-4 text-sm leading-6 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Service</div>
              <div className="mt-1 text-sm text-slate-100">{pendingRequest?.serviceName || "Loading..."}</div>
              <div className="mt-4 text-[11px] uppercase tracking-[0.26em] text-slate-400">Origin</div>
              <div className="mt-1 text-sm text-slate-100">{pendingRequest?.origin || "Loading..."}</div>
              <div className="mt-4 text-[11px] uppercase tracking-[0.26em] text-slate-400">Challenge</div>
              <div className="mt-1 break-all font-mono text-xs leading-5 text-slate-100">
                {pendingRequest?.challenge || "Loading..."}
              </div>
              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Service key</div>
                <div className="mt-3 break-all font-mono text-xs leading-5 text-slate-100">
                  {approvalChildCredential?.spkPublicKey ||
                    childCredentials.find((entry) => entry.serviceName === pendingRequest?.serviceName)?.publicKey ||
                    "Load master key and approve signup first"}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(busyAction) || !pendingRequest}
                onClick={handleRejectRequest}
              >
                {busyAction === "reject-request" ? "Rejecting..." : "Reject"}
              </button>
              <button
                className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
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

  const isRegistrationComplete = masterRegistrationState?.phase === "registered";

  if (!hasStoredIdentity || !isRegistrationComplete) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_28%),radial-gradient(circle_at_20%_20%,_rgba(16,185,129,0.08),_transparent_24%),linear-gradient(180deg,_#0a0f14_0%,_#0b1117_55%,_#070a0f_100%)] px-4 py-5 font-body text-slate-100">
        <div className="mx-auto w-full max-w-md">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">U2SSO Pass</p>
            <h1 className="mt-2 font-display text-3xl leading-tight text-slate-100">
              Create your vault
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Create or load your vault once. It must be registered before it can be used for
              sign-in.
            </p>
            <div className={`mt-6 rounded-[22px] border border-white/10 bg-white/[0.04] p-5 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_22px_60px_rgba(0,0,0,0.32)] ${creationFx ? "u2sso-animate-vault-breath" : ""}`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.34em] text-slate-400">
                    Master identity
                  </div>
                  <div className="mt-2 font-display text-xl text-slate-100">New vault</div>
                </div>
              </div>
              <div className="mt-5 rounded-[18px] border border-dashed border-white/10 bg-slate-950/70 px-4 py-5">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Public key</div>
                <div className="mt-2 text-sm leading-6 text-slate-200">
                  Create a vault to reveal your public key.
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3">
              <button
                className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-500/50"
                disabled={Boolean(busyAction)}
                onClick={handleCreateOrLoadIdentity}
              >
                {busyAction === "identity" ? "Creating identity..." : "Create master key"}
              </button>
            </div>
            {masterRegistrationState ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
                  On-chain registration
                </div>
                <div className="mt-2 leading-6">{masterRegistrationState.message}</div>
                {masterRegistrationState.phase === "failed" ? (
                  <button
                    className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                    disabled={Boolean(busyAction)}
                    onClick={handleCreateOrLoadIdentity}
                    type="button"
                  >
                    Retry registration
                  </button>
                ) : null}
              </div>
            ) : null}
            {error ? (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {error}
              </div>
            ) : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_28%),radial-gradient(circle_at_20%_20%,_rgba(16,185,129,0.08),_transparent_24%),linear-gradient(180deg,_#0a0f14_0%,_#0b1117_55%,_#070a0f_100%)] px-4 py-5 font-body text-slate-100">
      <div className="mx-auto w-full max-w-md">
        <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">U2SSO Pass</p>
          <h1 className="mt-2 font-display text-3xl leading-tight text-slate-100">
            Your vault
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Manage your vault and service identities.</p>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm text-slate-200">
                <button
                  className={`rounded-full px-4 py-2 transition ${
                    activeTab === "main"
                      ? "bg-slate-100 text-slate-950 shadow-sm"
                      : "text-slate-300 hover:text-slate-100"
                  }`}
                  onClick={() => setActiveTab("main")}
                  type="button"
                >
                  Main
                </button>
                <button
                  className={`rounded-full px-4 py-2 transition ${
                    activeTab === "services"
                      ? "bg-slate-100 text-slate-950 shadow-sm"
                      : "text-slate-300 hover:text-slate-100"
                  }`}
                  onClick={() => setActiveTab("services")}
                  type="button"
                >
                  Services
                </button>
              </div>
              <div className="text-right text-xs uppercase tracking-[0.28em] text-slate-400">
                {hasServices ? `${childCredentials.length} saved` : "No services yet"}
              </div>
            </div>

            {activeTab === "main" ? (
              <div className={`mt-5 ${creationFx ? "u2sso-animate-fade-up" : ""}`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">
                      Master identity
                    </p>
                    <h2 className="mt-2 font-display text-2xl text-slate-100">Vault root</h2>
                  </div>
                </div>
                <div className="mt-5 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
                    Public key
                  </div>
                  <div className="mt-3 break-all font-mono text-sm leading-6 text-slate-100">
                    {identityState?.masterIdentity?.publicKey?.join(",")}
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  This is the root identity stored in your vault. It anchors every service entry
                  below.
                </p>
                {masterRegistrationState ? (
                  <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
                      On-chain registration
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-200">
                      {masterRegistrationState.phase === "registered"
                        ? "Registered"
                        : masterRegistrationState.phase === "failed"
                          ? "Unregistered"
                          : "Registering..."}
                    </div>
                  </div>
                ) : null}
                <div className="mt-5 grid grid-cols-1 gap-3">
                  <button
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
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
                <p className="text-sm leading-6 text-slate-300">
                  Approved signups create one service identity card here.
                </p>
                {childCredentials.length > 0 ? (
                  childCredentials.map((entry, index) => (
                    <div
                      className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4 text-slate-100 u2sso-animate-fade-up"
                      key={entry.serviceName}
                      style={{ animationDelay: `${index * 55}ms` }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
                            {entry.serviceName}
                          </div>
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                          Public key
                        </div>
                      </div>
                      <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                          Public key
                        </div>
                        <div className="mt-3 break-all font-mono text-xs leading-5 text-slate-100">
                          {entry.publicKey}
                        </div>
                      </div>
                      {entry.commitment ? (
                        <div className="mt-3 text-xs leading-5 text-slate-400">
                          Commitment: {shorten(entry.commitment, 14, 10)}
                        </div>
                      ) : null}
                    </div>
                    ))
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm leading-6 text-slate-300">
                      No service credentials yet. Approve a signup request to save one.
                    </div>
                  )}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
