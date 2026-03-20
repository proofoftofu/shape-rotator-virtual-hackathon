import { installBufferPolyfill } from "./installBufferPolyfill.js";
import { isValidExtensionRequest } from "./messageBridge.js";

installBufferPolyfill();

console.log("[u2sso-extension] content bridge injected");

function postResponse(response) {
  console.log("[u2sso-extension] posting response to page", response);
  window.postMessage(response, "*");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "u2sso:deliverResponse") {
    return undefined;
  }

  postResponse(message.response);
  sendResponse({ ok: true });
  return false;
});

window.addEventListener("message", (event) => {
  if (event.source !== window || !isValidExtensionRequest(event.data)) {
    return;
  }

  console.log("[u2sso-extension] forwarding request to background", event.data);

  chrome.runtime.sendMessage(
    {
      origin: window.location.origin,
      request: event.data,
      type: "u2sso:queueRequest"
    },
    (result) => {
      const lastError = chrome.runtime.lastError;

      if (lastError) {
        postResponse({
          error: lastError.message,
          flow: event.data.flow,
          requestId: event.data.requestId,
          source: "u2sso-extension"
        });
        return;
      }

      if (result?.error) {
        postResponse({
          error: result.error,
          flow: event.data.flow,
          requestId: event.data.requestId,
          source: "u2sso-extension"
        });
      }

      if (result?.mode === "approval") {
        console.log("[u2sso-extension] request queued for approval", event.data.requestId);
      }
    }
  );
});
