"use strict";

function extractPayloadForFlow(flow, body) {
  return flow === "signup" ? body.registrationPayload : body.loginPayload;
}

async function fetchDemoPayload(flow, challengeData, fetchImpl = fetch) {
  const response = await fetchImpl(`/api/demo-extension/${flow}`, {
    body: JSON.stringify({
      challenge: challengeData.challenge,
      serviceName: challengeData.serviceName
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || "Failed to create demo payload");
  }

  return {
    payload: extractPayloadForFlow(flow, body),
    source: "demo"
  };
}

async function requestPayloadWithFallback(flow, challengeData, dependencies) {
  const requestExtension = dependencies.requestExtension;
  const fetchDemo = dependencies.fetchDemo;

  try {
    const extensionResult = await requestExtension(flow, challengeData);
    return {
      payload: extractPayloadForFlow(flow, extensionResult),
      source: "extension"
    };
  } catch (error) {
    if (fetchDemo == null) {
      throw error;
    }

    const fallback = await fetchDemo(flow, challengeData);
    return {
      fallbackReason: error.message,
      payload: fallback.payload,
      source: fallback.source || "demo"
    };
  }
}

module.exports = {
  extractPayloadForFlow,
  fetchDemoPayload,
  requestPayloadWithFallback
};
