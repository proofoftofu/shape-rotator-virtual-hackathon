"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { requestPayloadFromExtension } from "./extensionBridge";

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
      setStatus("Extension payload received.");
      setStatusTone("success");
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    }
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
          This page requests signup and login payloads from the extension and submits them to the
          server verification flow.
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
    </>
  );
}
