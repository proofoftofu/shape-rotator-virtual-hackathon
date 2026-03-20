import {
  DEFAULT_GROUP_SECRETS,
  DEMO_EXTENSION_MASTER_SECRET,
  loadSnarkArtifactBytes,
  runExtensionExperiment
} from "./experimentController.js";

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
  const experimentOptions = {
    ...options.experimentOptions,
    groupSecrets: DEFAULT_GROUP_SECRETS,
    masterSecret: options.experimentOptions?.masterSecret || DEMO_EXTENSION_MASTER_SECRET,
    serviceName: message.serviceName,
    registrationChallenge: message.flow === "signup"
      ? message.challenge
      : options.experimentOptions && options.experimentOptions.registrationChallenge,
    loginChallenge: message.flow === "login"
      ? message.challenge
      : options.experimentOptions && options.experimentOptions.loginChallenge
  };

  if (!experimentOptions.snarkArtifacts && !options.runExtensionExperimentImpl) {
    experimentOptions.snarkArtifacts = await loadSnarkArtifactBytes(
      options.experimentOptions?.runtimeBaseUrl
    );
  }

  const result = await runExperiment(experimentOptions);

  console.log("[u2sso-extension] createExtensionResponse result", {
    flow: message.flow,
    hasMasterIdentity: Boolean(result.masterIdentity),
    hasRegistrationPayload: Boolean(result.registrationPayload),
    hasLoginPayload: Boolean(result.loginPayload),
    memberIndex: result.registrationPayload?.memberIndex,
    groupRoot: result.registrationPayload?.groupRoot
  });

  return {
    source: RESPONSE_SOURCE,
    flow: message.flow,
    requestId: message.requestId,
    ...(message.flow === "signup" && result.masterIdentity ? { masterIdentity: result.masterIdentity } : {}),
    payload: message.flow === "signup"
      ? result.registrationPayload
      : result.loginPayload
  };
}

export function createWindowMessageBridge(options = {}) {
  const targetWindow = options.targetWindow || window;

  async function handleMessage(event) {
    if (!isValidExtensionRequest(event.data)) {
      return;
    }

    console.log("[u2sso-extension] received request", event.data);

    try {
      const response = await createExtensionResponse(event.data, options);
      console.log("[u2sso-extension] posting response", response);
      targetWindow.postMessage(response, "*");
    } catch (error) {
      const responseError = error instanceof Error ? error.message : String(error);
      console.error("[u2sso-extension] failed to create response", responseError);
      targetWindow.postMessage(
        {
          source: RESPONSE_SOURCE,
          flow: event.data.flow,
          requestId: event.data.requestId,
          error: responseError
        },
        "*"
      );
    }
  }

  return {
    handleMessage,
    start() {
      console.log("[u2sso-extension] starting window message bridge");
      targetWindow.addEventListener("message", handleMessage);
    },
    stop() {
      console.log("[u2sso-extension] stopping window message bridge");
      targetWindow.removeEventListener("message", handleMessage);
    }
  };
}

export {
  REQUEST_SOURCE,
  REQUEST_TYPE,
  RESPONSE_SOURCE
};
