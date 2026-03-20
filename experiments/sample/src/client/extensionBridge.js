"use client";

export function requestPayloadFromExtension(flow, { challenge, serviceName }) {
  if (typeof window === "undefined") {
    throw new Error("Extension bridge is only available in the browser");
  }

  return new Promise((resolve, reject) => {
    const requestId = `${flow}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      console.log("[u2sso-sample] extension request timed out", {
        flow,
        requestId,
        serviceName
      });
      reject(new Error(`No extension response received for request ${requestId}`));
    }, 60000);

    function onMessage(event) {
      const data = event.data;

      if (
        !data ||
        data.source !== "u2sso-extension" ||
        data.flow !== flow ||
        data.requestId !== requestId
      ) {
        return;
      }

      console.log("[u2sso-sample] received extension response", data);
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);

      if (data.error) {
        reject(new Error(data.error));
        return;
      }

      resolve(data.payload);
    }

    window.addEventListener("message", onMessage);
    console.log("[u2sso-sample] posting extension request", {
      challenge,
      flow,
      requestId,
      serviceName
    });
    window.postMessage(
      {
        challenge,
        flow,
        requestId,
        serviceName,
        source: "u2sso-sample",
        type: "u2sso:request"
      },
      "*"
    );
  });
}
