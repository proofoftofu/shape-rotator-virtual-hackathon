import test from "node:test";
import assert from "node:assert/strict";

import {
  REQUEST_SOURCE,
  REQUEST_TYPE,
  RESPONSE_SOURCE,
  createExtensionResponse,
  createWindowMessageBridge,
  isValidExtensionRequest
} from "../src/messageBridge.js";

function createMockWindow() {
  const listeners = new Map();
  const postedMessages = [];

  return {
    postedMessages,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) {
        listeners.delete(type);
      }
    },
    postMessage(message) {
      postedMessages.push(message);
    },
    async dispatchMessage(data, source) {
      const handler = listeners.get("message");

      if (!handler) {
        throw new Error("No message listener registered");
      }

      await handler({
        data,
        source
      });
    }
  };
}

test("isValidExtensionRequest accepts the sample app contract", () => {
  assert.equal(isValidExtensionRequest({
    source: REQUEST_SOURCE,
    type: REQUEST_TYPE,
    flow: "signup",
    challenge: "signup-challenge",
    serviceName: "demo.service.local"
  }), true);

  assert.equal(isValidExtensionRequest({
    source: REQUEST_SOURCE,
    type: REQUEST_TYPE,
    flow: "unknown",
    challenge: "signup-challenge",
    serviceName: "demo.service.local"
  }), false);
});

test("createExtensionResponse returns registration payload for signup", async () => {
  const response = await createExtensionResponse(
    {
      source: REQUEST_SOURCE,
      type: REQUEST_TYPE,
      flow: "signup",
      challenge: "signup-challenge",
      serviceName: "demo.service.local"
    },
    {
      runExtensionExperimentImpl: async (options) => ({
        registrationPayload: {
          challenge: options.registrationChallenge,
          kind: "registration"
        },
        loginPayload: {
          challenge: options.loginChallenge,
          kind: "login"
        }
      })
    }
  );

  assert.deepEqual(response, {
    source: RESPONSE_SOURCE,
    flow: "signup",
    payload: {
      challenge: "signup-challenge",
      kind: "registration"
    }
  });
});

test("createExtensionResponse returns login payload for login", async () => {
  const response = await createExtensionResponse(
    {
      source: REQUEST_SOURCE,
      type: REQUEST_TYPE,
      flow: "login",
      challenge: "login-challenge",
      serviceName: "demo.service.local"
    },
    {
      runExtensionExperimentImpl: async (options) => ({
        registrationPayload: {
          challenge: options.registrationChallenge,
          kind: "registration"
        },
        loginPayload: {
          challenge: options.loginChallenge,
          kind: "login"
        }
      })
    }
  );

  assert.deepEqual(response, {
    source: RESPONSE_SOURCE,
    flow: "login",
    payload: {
      challenge: "login-challenge",
      kind: "login"
    }
  });
});

test("window bridge responds to valid sample app requests", async () => {
  const mockWindow = createMockWindow();
  const bridge = createWindowMessageBridge({
    targetWindow: mockWindow,
    runExtensionExperimentImpl: async (options) => ({
      registrationPayload: {
        challenge: options.registrationChallenge,
        flow: "signup"
      },
      loginPayload: {
        challenge: options.loginChallenge,
        flow: "login"
      }
    })
  });

  bridge.start();
  await mockWindow.dispatchMessage(
    {
      source: REQUEST_SOURCE,
      type: REQUEST_TYPE,
      flow: "signup",
      challenge: "signup-challenge",
      serviceName: "demo.service.local"
    },
    mockWindow
  );
  bridge.stop();

  assert.deepEqual(mockWindow.postedMessages, [
    {
      source: RESPONSE_SOURCE,
      flow: "signup",
      payload: {
        challenge: "signup-challenge",
        flow: "signup"
      }
    }
  ]);
});

test("window bridge ignores messages outside the sample app contract", async () => {
  const mockWindow = createMockWindow();
  const bridge = createWindowMessageBridge({
    targetWindow: mockWindow,
    runExtensionExperimentImpl: async () => {
      throw new Error("should not be called");
    }
  });

  bridge.start();
  await mockWindow.dispatchMessage(
    {
      source: "other-app",
      type: REQUEST_TYPE,
      flow: "signup",
      challenge: "signup-challenge",
      serviceName: "demo.service.local"
    },
    mockWindow
  );
  bridge.stop();

  assert.deepEqual(mockWindow.postedMessages, []);
});
