"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { requestPayloadFromExtension } from "./extensionBridge";

export default function U2SSOFlowClient({ flow }) {
  const [challengeData, setChallengeData] = useState(null);
  const [payload, setPayload] = useState("");
  const [masterIdentity, setMasterIdentity] = useState(null);
  const [registrationState, setRegistrationState] = useState(null);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadChallenge() {
      const response = await fetch(`/api/challenge?flow=${flow}`);
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Failed to load challenge");
      }

      if (!cancelled) {
        console.log("[u2sso-sample] challenge loaded", body);
        setChallengeData(body);
      }
    }

    loadChallenge().catch((error) => {
      if (!cancelled) {
        setStatus(error.message);
        setStatusTone("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [flow]);

  async function requestFromExtension() {
    console.log("[u2sso-sample] request button clicked", {
      challengeReady: Boolean(challengeData),
      flow
    });

    if (!challengeData) {
      setStatus("Challenge is still loading. Please wait a moment and try again.");
      setStatusTone("error");
      return;
    }

    try {
      const nextPayload = await requestPayloadFromExtension(flow, challengeData);
      setPayload(JSON.stringify(nextPayload, null, 2));
      setMasterIdentity(nextPayload.masterIdentity || null);
      setStatus("Extension payload received.");
      setStatusTone("success");

      if (flow === "signup" && nextPayload.masterIdentity) {
        await refreshRegistrationState(nextPayload.masterIdentity);
      }
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    }
  }

  async function refreshRegistrationState(nextMasterIdentity = masterIdentity) {
    if (!nextMasterIdentity) {
      setStatus("No master identity payload is available yet.");
      setStatusTone("error");
      return;
    }

    const [id, id33] = nextMasterIdentity.publicKey || [];
    const response = await fetch(`/api/master-identity?id=${encodeURIComponent(id)}&id33=${encodeURIComponent(id33)}`);
    const body = await response.json();
    console.log("[u2sso-sample] master identity registration status", {
      body,
      ok: response.ok,
      status: response.status
    });

    if (!response.ok) {
      setStatus(body.error || "Failed to read master identity registration state");
      setStatusTone("error");
      return;
    }

    setRegistrationState(body);
    setStatus(body.registration?.active ? "Master identity is registered." : "Master identity is not registered yet.");
    setStatusTone(body.registration?.active ? "success" : "error");
  }

  async function submitFlow() {
    console.log("[u2sso-sample] submit button clicked", {
      challengeReady: Boolean(challengeData),
      flow,
      hasPayload: Boolean(payload)
    });

    if (!challengeData) {
      return;
    }

    let parsedPayload;

    try {
      parsedPayload = JSON.parse(payload);
    } catch (error) {
      setStatus("Payload must be valid JSON.");
      setStatusTone("error");
      return;
    }

    const response = await fetch(`/api/${flow}`, {
      body: JSON.stringify({
        challengeId: challengeData.challengeId,
        serviceName: challengeData.serviceName,
        [flow === "signup" ? "registrationPayload" : "loginPayload"]: parsedPayload
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const body = await response.json();
    console.log("[u2sso-sample] server response received", {
      body,
      flow,
      ok: response.ok,
      status: response.status
    });

    if (!response.ok) {
      setStatus(body.error || "Flow failed");
      setStatusTone("error");
      return;
    }

    console.log("[u2sso-sample] submit to server succeeded", body);
    setStatus(JSON.stringify(body, null, 2));
    setStatusTone("success");
  }

  return (
    <>
      <section className="hero">
        <p className="meta">{flow === "signup" ? "Signup" : "Login"} flow</p>
        <h1>{flow === "signup" ? "Sign up with U2SSO" : "Log in with U2SSO"}</h1>
        <p>
          This page requests proof and signature payloads from the extension. The extension also
          registers the master identity on-chain through this service API before the signup flow
          completes.
        </p>
        <div className="links">
          <Link className="linkButton secondary" href={flow === "signup" ? "/login" : "/signup"}>
            {flow === "signup" ? "Go to login" : "Go to signup"}
          </Link>
          <Link className="linkButton secondary" href="/">
            Back home
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Request</h2>
          <p className="meta">
            Challenge ID: {challengeData?.challengeId || "loading"}
            <br />
            Challenge: {challengeData?.challenge || "loading"}
            <br />
            Service: {challengeData?.serviceName || "loading"}
          </p>

          <div className="stack">
            <button
              onClick={() => {
                console.log("[u2sso-sample] raw button onClick fired", { flow });
                setStatus("Request button clicked.");
                setStatusTone("");
                void requestFromExtension();
              }}
              type="button"
            >
              Request from extension
            </button>
            <button onClick={submitFlow} type="button">
              Submit to server
            </button>
          </div>
        </article>

        <article className="panel">
          <h2>Payload</h2>
          <textarea
            onChange={(event) => setPayload(event.target.value)}
            placeholder={`Paste the ${flow} payload here`}
            value={payload}
          />
          {status ? <pre className={`status ${statusTone}`}>{status}</pre> : null}
        </article>
      </section>

      {flow === "signup" ? (
      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Master identity status</h2>
        <p className="meta">
            The extension registers the vault master identity on-chain through this API. Use this
            panel to verify the current registration state.
        </p>
        <div className="stack">
          <button disabled={!masterIdentity} onClick={() => refreshRegistrationState()} type="button">
            Check registration status
          </button>
        </div>
        {registrationState ? <pre className="status">{JSON.stringify(registrationState, null, 2)}</pre> : null}
      </section>
      ) : null}
    </>
  );
}
