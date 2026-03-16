import { runExtensionExperiment } from "./experimentController.js";

const REQUEST_SOURCE = "u2sso-sample";
const REQUEST_TYPE = "u2sso:request";
const RESPONSE_SOURCE = "u2sso-extension";
const SUPPORTED_FLOWS = new Set(["signup", "login"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidExtensionRequest(message) {
  return Boolean(
    message &&
    message.source === REQUEST_SOURCE &&
    message.type === REQUEST_TYPE &&
    SUPPORTED_FLOWS.has(message.flow) &&
    isNonEmptyString(message.challenge) &&
    isNonEmptyString(message.serviceName)
  );
}

export async function createExtensionResponse(message, options = {}) {
  if (!isValidExtensionRequest(message)) {
    throw new Error("Invalid U2SSO extension request");
  }

  const runExperiment = options.runExtensionExperimentImpl || runExtensionExperiment;
  const result = await runExperiment({
    ...options.experimentOptions,
    serviceName: message.serviceName,
    registrationChallenge: message.flow === "signup"
      ? message.challenge
      : options.experimentOptions && options.experimentOptions.registrationChallenge,
    loginChallenge: message.flow === "login"
      ? message.challenge
      : options.experimentOptions && options.experimentOptions.loginChallenge
  });

  return {
    source: RESPONSE_SOURCE,
    flow: message.flow,
    payload: message.flow === "signup"
      ? result.registrationPayload
      : result.loginPayload
  };
}

export function createWindowMessageBridge(options = {}) {
  const targetWindow = options.targetWindow || window;

  async function handleMessage(event) {
    if (event.source !== targetWindow || !isValidExtensionRequest(event.data)) {
      return;
    }

    try {
      const response = await createExtensionResponse(event.data, options);
      targetWindow.postMessage(response, "*");
    } catch (error) {
      targetWindow.postMessage(
        {
          source: RESPONSE_SOURCE,
          flow: event.data.flow,
          error: error instanceof Error ? error.message : String(error)
        },
        "*"
      );
    }
  }

  return {
    handleMessage,
    start() {
      targetWindow.addEventListener("message", handleMessage);
    },
    stop() {
      targetWindow.removeEventListener("message", handleMessage);
    }
  };
}

export {
  REQUEST_SOURCE,
  REQUEST_TYPE,
  RESPONSE_SOURCE
};
