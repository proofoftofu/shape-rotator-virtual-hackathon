"use client";

export function requestPayloadFromExtension(flow, { challenge, serviceName }) {
  if (typeof window === "undefined") {
    throw new Error("Extension bridge is only available in the browser");
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("No extension response received"));
    }, 1500);

    function onMessage(event) {
      const data = event.data;

      if (!data || data.source !== "u2sso-extension" || data.flow !== flow) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(data.payload);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        challenge,
        flow,
        serviceName,
        source: "u2sso-sample",
        type: "u2sso:request"
      },
      "*"
    );
  });
}
