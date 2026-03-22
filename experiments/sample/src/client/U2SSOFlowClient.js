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
  const [logEntries, setLogEntries] = useState([]);
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
      setLogEntries((current) => [
        {
          label: "step.1.payload",
          value: nextPayload
        }
      ]);
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
        setLogEntries((current) => [
          {
            label: "step.2.result",
            value: {
              error: body.error || "Flow failed",
              status: response.status
            }
          }
        ]);
        return;
      }

      console.log("[u2sso-sample] flow succeeded", body);
      setStatus(JSON.stringify(body, null, 2));
      setStatusTone("success");
      setResult(body);
      setLogEntries((current) => [
        {
          label: "step.2.result",
          value: body
        }
      ]);
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
      setLogEntries((current) => [
        {
          label: "step.2.result",
          value: {
            message: error.message
          }
        }
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">U2SSO Pass</p>
        <h1>{flow === "signup" ? "Create your service account" : "Sign in to continue"}</h1>
        <p>
          {flow === "signup"
            ? "Create a normal-looking account flow, then hand the technical details to the log panel."
            : "Use the same clean sign-in surface, with the JSON trail kept visible in a separate panel."}
        </p>
        <div className="heroSummary">
          <div>
            <span className="summaryLabel">Step</span>
            <strong>{flow === "signup" ? "Register" : "Authenticate"}</strong>
          </div>
          <div>
            <span className="summaryLabel">Mode</span>
            <strong>Demo UI with tech logs</strong>
          </div>
        </div>
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
            {logEntries.map((entry) => (
              <div className="logItem" key={`${entry.label}-${JSON.stringify(entry.value).slice(0, 24)}`}>
                <div className="logLabel">{entry.label}</div>
                <pre>{JSON.stringify(entry.value, null, 2)}</pre>
              </div>
            ))}
          </div>
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
        </article>
      </section>
    </>
  );
}
