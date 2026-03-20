const PENDING_REQUESTS_KEY = "u2sso.pendingRequests";

async function getPendingRequests() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(PENDING_REQUESTS_KEY, (result) => {
      const lastError = chrome.runtime && chrome.runtime.lastError;

      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      const value = result[PENDING_REQUESTS_KEY];
      resolve(Array.isArray(value) ? value : []);
    });
  });
}

async function setPendingRequests(requests) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [PENDING_REQUESTS_KEY]: requests }, () => {
      const lastError = chrome.runtime && chrome.runtime.lastError;

      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve();
    });
  });
}

async function savePendingRequest(record) {
  const requests = await getPendingRequests();
  const nextRequests = requests.filter((entry) => entry.requestId !== record.requestId);
  nextRequests.push(record);
  await setPendingRequests(nextRequests);
  return record;
}

async function getPendingRequest(requestId) {
  const requests = await getPendingRequests();
  return requests.find((entry) => entry.requestId === requestId) || null;
}

async function removePendingRequest(requestId) {
  const requests = await getPendingRequests();
  const nextRequests = requests.filter((entry) => entry.requestId !== requestId);
  await setPendingRequests(nextRequests);
}

function createApprovalWindowUrl(requestId) {
  return `index.html?mode=approval&requestId=${encodeURIComponent(requestId)}`;
}

function openApprovalPopup(requestId) {
  chrome.windows.create({
    focused: true,
    height: 760,
    type: "popup",
    url: chrome.runtime.getURL(createApprovalWindowUrl(requestId)),
    width: 440
  });
}

function deliverResponse(record, response) {
  if (record.tabId === null || record.tabId === undefined) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      record.tabId,
      {
        response,
        type: "u2sso:deliverResponse"
      },
      { frameId: record.frameId || 0 },
      () => {
        const lastError = chrome.runtime && chrome.runtime.lastError;

        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        resolve();
      }
    );
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") {
    return;
  }

  chrome.tabs.create({
    active: true,
    url: chrome.runtime.getURL("index.html?mode=setup")
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const handler = async () => {
    switch (message.type) {
      case "u2sso:queueRequest": {
        const record = {
          challenge: message.request.challenge,
          createdAt: Date.now(),
          flow: message.request.flow,
          frameId: sender.frameId || 0,
          origin: message.origin || sender.origin || "Unknown origin",
          requestId: message.request.requestId,
          serviceName: message.request.serviceName,
          source: message.request.source,
          status: "pending",
          tabId: sender.tab?.id ?? null,
          type: message.request.type,
          windowId: null
        };

        await savePendingRequest(record);
        openApprovalPopup(message.request.requestId);
        return {
          mode: "approval",
          queued: true,
          requestId: message.request.requestId
        };
      }
      case "u2sso:getPendingRequest":
        return {
          request: await getPendingRequest(message.requestId)
        };
      case "u2sso:approveRequest": {
        const record = await getPendingRequest(message.requestId);

        if (!record) {
          throw new Error("Unknown pending request");
        }

        await deliverResponse(record, message.response);
        await removePendingRequest(message.requestId);
        return {
          ok: true
        };
      }
      case "u2sso:rejectRequest": {
        const record = await getPendingRequest(message.requestId);

        if (!record) {
          throw new Error("Unknown pending request");
        }

        await deliverResponse(record, {
          error: message.reason || "Request rejected",
          flow: record.flow,
          requestId: record.requestId,
          source: "u2sso-extension"
        });
        await removePendingRequest(message.requestId);
        return {
          ok: true
        };
      }
      default:
        return null;
    }
  };

  handler()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ error: error.message }));

  return true;
});
