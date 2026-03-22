"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { requestPayloadFromExtension } from "./extensionBridge";

export default function U2SSOFlowClient({ flow }) {
  const [challengeData, setChallengeData] = useState(null);
  const [payload, setPayload] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("");
  const [result, setResult] = useState(null);
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
    setResult(null);

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
      setResult(body);
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbarBrand">
          <p className="eyebrow">U2SSO Pass</p>
        </div>
        <nav className="topbarNav" aria-label="Primary">
          <Link className="topbarLink" href={flow === "signup" ? "/login" : "/signup"}>
            {flow === "signup" ? "Sign in" : "Sign up"}
          </Link>
          <Link className="topbarLink" href="/">
            Overview
          </Link>
        </nav>
      </header>

      <section className="panel installPanel">
        <div className="panelHeading">
          <div>
            <p className="eyebrow">Extension setup</p>
            <h2>Install the browser extension</h2>
          </div>
          <p className="panelKicker">Required for the real flow</p>
        </div>
        <p className="meta">
          Download the extension ZIP, then follow the Chrome extension setup steps to load it
          locally. This makes the signup and sign-in demo behave like a real browser extension flow.
        </p>
        <div className="stack">
          <a className="linkButton" href="/u2sso-pass-extension.zip" download>
            Download extension ZIP
          </a>
          <Link
            className="linkButton secondary"
            href="https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world"
            target="_blank"
            rel="noreferrer"
          >
            Chrome setup guide
          </Link>
        </div>
        <ol className="installSteps">
          <li>Download the ZIP from this page.</li>
          <li>Extract the ZIP into a normal folder on your computer.</li>
          <li>Open Chrome and go to the extensions page.</li>
          <li>Turn on Developer mode.</li>
          <li>Load the unpacked extension from the extracted folder.</li>
          <li>Return here and try sign up or sign in again.</li>
        </ol>
      </section>

      <section className="grid">
        <article className="panel">
          <div className="panelHeading">
            <div>
              <p className="eyebrow">Account access</p>
              <h2>{flow === "signup" ? "Create account" : "Sign in"}</h2>
            </div>
            <p className="panelKicker">Service: {challengeData?.serviceName || "loading"}</p>
          </div>
          <p className="meta">
            {flow === "signup"
              ? "This is the user-facing path. The JSON is shown elsewhere so the page still feels like a normal product."
              : "The flow stays simple: press the button, approve the payload, then land on the welcome state."}
          </p>
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
                  ? "Create account"
                  : "Sign in"}
            </button>
          </div>
          {statusTone === "success" && result ? (
            <div className="welcomeCard">
              <p className="eyebrow">Welcome</p>
              <h3>Signed in successfully</h3>
              <p className="meta">
                Session established for <strong>{result.serviceName || challengeData?.serviceName}</strong>.
              </p>
            </div>
          ) : null}
        </article>

        <article className="panel">
          <div className="panelHeading">
            <div>
              <p className="eyebrow">Tech log</p>
              <h2>JSON and event trail</h2>
            </div>
            <p className="panelKicker">Raw detail</p>
          </div>
          <div className="logMeta">
            <span>Challenge ID</span>
            <code>{challengeData?.challengeId || "loading"}</code>
          </div>
          <div className="logMeta">
            <span>Challenge</span>
            <code>{challengeData?.challenge || "loading"}</code>
          </div>
          <div className="logStream">
            <div className="jsonSection">
              <div className="jsonSectionHeader">
                <div>
                  <p className="eyebrow">Step 1</p>
                  <h3>Payload prepared for the service</h3>
                </div>
                <p className="meta">
                  This is the request body created after extension approval or demo fallback.
                </p>
              </div>
              <pre className="jsonCard jsonCardNeutral">
                {payload || "Payload will appear here after approval"}
              </pre>
            </div>
            <div className="jsonSection">
              <div className="jsonSectionHeader">
                <div>
                  <p className="eyebrow">Step 2</p>
                  <h3>Server result</h3>
                </div>
                <p className="meta">This is the final response from signup or sign in.</p>
              </div>
              {status ? <pre className={`status ${statusTone}`}>{status}</pre> : null}
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
