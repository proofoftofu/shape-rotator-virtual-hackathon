"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { requestPayloadFromExtension } from "./extensionBridge";
import { fetchDemoPayload, requestPayloadWithFallback } from "./payloadRequest";

export default function U2SSOFlowClient({ flow }) {
  const [challengeData, setChallengeData] = useState(null);
  const [payload, setPayload] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadChallenge() {
      const response = await fetch(`/api/challenge?flow=${flow}`);
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Failed to load challenge");
      }

      if (!cancelled) {
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
    if (!challengeData) {
      return;
    }

    try {
      const result = await requestPayloadWithFallback(flow, challengeData, {
        fetchDemo: fetchDemoPayload,
        requestExtension: requestPayloadFromExtension
      });
      const nextPayload = result.payload;
      setPayload(JSON.stringify(nextPayload, null, 2));
      setStatus(
        result.source === "extension"
          ? "Extension payload received."
          : `Extension unavailable. Demo payload generated with the shared logic experiment.\nReason: ${result.fallbackReason}`
      );
      setStatusTone("success");
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    }
  }

  async function requestDemoPayload() {
    if (!challengeData) {
      return;
    }

    try {
      const result = await fetchDemoPayload(flow, challengeData);
      setPayload(JSON.stringify(result.payload, null, 2));
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
      return;
    }

    setStatus("Demo payload generated with the shared logic experiment.");
    setStatusTone("success");
  }

  async function submitFlow() {
    if (!challengeData) {
      return;
    }

    if (!username) {
      setStatus("Username is required.");
      setStatusTone("error");
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
        username,
        [flow === "signup" ? "registrationPayload" : "loginPayload"]: parsedPayload
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const body = await response.json();

    if (!response.ok) {
      setStatus(body.error || "Flow failed");
      setStatusTone("error");
      return;
    }

    setStatus(JSON.stringify(body, null, 2));
    setStatusTone("success");
  }

  return (
    <>
      <section className="hero">
        <p className="meta">{flow === "signup" ? "Signup" : "Login"} flow</p>
        <h1>{flow === "signup" ? "Sign up with U2SSO" : "Log in with U2SSO"}</h1>
        <p>
          The primary path is extension messaging. If the extension does not answer, the request
          falls back to demo payload generation while keeping the same server verification path.
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

          <div className="formRow">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="alice"
              value={username}
            />
          </div>

          <div className="stack">
            <button onClick={requestFromExtension} type="button">
              Request payload
            </button>
            <button className="secondary" onClick={requestDemoPayload} type="button">
              Use demo payload
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
    </>
  );
}
