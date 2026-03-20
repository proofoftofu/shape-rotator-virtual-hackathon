"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { requestPayloadFromExtension } from "./extensionBridge";

export default function U2SSOFlowClient({ flow }) {
  const [challengeData, setChallengeData] = useState(null);
  const [payload, setPayload] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function runFlow() {
    console.log("[u2sso-sample] primary action clicked", {
      challengeReady: Boolean(challengeData),
      flow
    });

    if (!challengeData) {
      setStatus("Challenge is still loading. Please wait a moment and try again.");
      setStatusTone("error");
      return;
    }

    setBusy(true);
    setStatus("");
    setStatusTone("");

    try {
      const nextPayload = await requestPayloadFromExtension(flow, challengeData);
      setPayload(JSON.stringify(nextPayload, null, 2));
      console.log("[u2sso-sample] extension payload received", {
        flow,
        hasPayload: Boolean(nextPayload)
      });

      const response = await fetch(`/api/${flow}`, {
        body: JSON.stringify({
          challengeId: challengeData.challengeId,
          serviceName: challengeData.serviceName,
          [flow === "signup" ? "registrationPayload" : "loginPayload"]: nextPayload
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

      console.log("[u2sso-sample] flow succeeded", body);
      setStatus(JSON.stringify(body, null, 2));
      setStatusTone("success");
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <p className="meta">U2SSO Pass</p>
        <h1>{flow === "signup" ? "Create account" : "Welcome back"}</h1>
        <p>
          {flow === "signup"
            ? "Connect your vault to create a service identity."
            : "Use your saved service identity to sign in."}
        </p>
        <div className="links">
          <Link className="linkButton secondary" href={flow === "signup" ? "/login" : "/signup"}>
            {flow === "signup" ? "Switch to sign in" : "Switch to sign up"}
          </Link>
          <Link className="linkButton secondary" href="/">
            About U2SSO
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>{flow === "signup" ? "Sign up" : "Sign in"}</h2>
          <p className="meta">Service: {challengeData?.serviceName || "loading"}</p>
          <div className="stack">
            <button
              className="primaryAction"
              disabled={busy || !challengeData}
              onClick={() => {
                console.log("[u2sso-sample] primary button onClick fired", { flow });
                void runFlow();
              }}
              type="button"
            >
              {busy
                ? "Waiting for approval..."
                : flow === "signup"
                  ? "Sign up with U2SSO Pass"
                  : "Sign in with U2SSO Pass"}
            </button>
          </div>
        </article>

        <article className="panel">
          <h2>Activity</h2>
          <div className="statusGroup">
            <p className="meta">Challenge ID: {challengeData?.challengeId || "loading"}</p>
            <p className="meta">Challenge: {challengeData?.challenge || "loading"}</p>
          </div>
          <textarea
            className="payloadBox"
            onChange={(event) => setPayload(event.target.value)}
            placeholder={`Payload will appear here after approval`}
            value={payload}
          />
          {status ? <pre className={`status ${statusTone}`}>{status}</pre> : null}
        </article>
      </section>
    </>
  );
}
