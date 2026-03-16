"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  DEMO_SEMAPHORE_ARTIFACTS,
  DEMO_SERVICE_NAME,
  createDemoExtensionPayload,
  issueChallenge,
  loginAccount,
  registerAccount
} = require("../src/server/demoService");
const { requestPayloadWithFallback } = require("../src/client/payloadRequest");
const { resetStore } = require("../src/server/demoStore");
const { terminateProofWorkers } = require("../../logic/src");

test.beforeEach(() => {
  resetStore();
});

test.after(async () => {
  resetStore();
  await terminateProofWorkers();
});

test("signup verification accepts a real registration payload from the shared logic experiment", async () => {
  const signupChallenge = await issueChallenge("signup");
  const extensionResult = await createDemoExtensionPayload(
    "signup",
    signupChallenge.challenge,
    DEMO_SERVICE_NAME
  );

  const account = await registerAccount({
    challengeId: signupChallenge.challengeId,
    registrationPayload: extensionResult.registrationPayload,
    serviceName: DEMO_SERVICE_NAME
  });

  assert.equal(account.serviceName, DEMO_SERVICE_NAME);
  assert.equal(account.spkPublicKey, extensionResult.registrationPayload.spkPublicKey);
  assert.equal(typeof account.nullifier, "string");
});

test("demo payload generation uses explicit logic artifact paths instead of Next bundle paths", async () => {
  assert.equal(fs.existsSync(DEMO_SEMAPHORE_ARTIFACTS.wasm), true);
  assert.equal(fs.existsSync(DEMO_SEMAPHORE_ARTIFACTS.zkey), true);
  assert.equal(DEMO_SEMAPHORE_ARTIFACTS.wasm.includes(".next/server"), false);
  assert.equal(DEMO_SEMAPHORE_ARTIFACTS.zkey.includes(".next/server"), false);

  const signupChallenge = await issueChallenge("signup");
  const extensionResult = await createDemoExtensionPayload(
    "signup",
    signupChallenge.challenge,
    DEMO_SERVICE_NAME
  );

  assert.equal(typeof extensionResult.registrationPayload.nullifier, "string");
});

test("login verification issues a session after a valid signup", async () => {
  const signupChallenge = await issueChallenge("signup");
  const signupPayload = await createDemoExtensionPayload(
    "signup",
    signupChallenge.challenge,
    DEMO_SERVICE_NAME
  );

  await registerAccount({
    challengeId: signupChallenge.challengeId,
    registrationPayload: signupPayload.registrationPayload,
    serviceName: DEMO_SERVICE_NAME
  });

  const loginChallenge = await issueChallenge("login");
  const loginPayload = await createDemoExtensionPayload(
    "login",
    loginChallenge.challenge,
    DEMO_SERVICE_NAME
  );

  const session = await loginAccount({
    challengeId: loginChallenge.challengeId,
    loginPayload: loginPayload.loginPayload,
    serviceName: DEMO_SERVICE_NAME
  });

  assert.equal(session.serviceName, DEMO_SERVICE_NAME);
  assert.equal(session.spkPublicKey, loginPayload.loginPayload.spkPublicKey);
  assert.equal(typeof session.sessionToken, "string");
});

test("signup rejects a duplicate nullifier for the same service", async () => {
  const firstChallenge = await issueChallenge("signup");
  const firstPayload = await createDemoExtensionPayload(
    "signup",
    firstChallenge.challenge,
    DEMO_SERVICE_NAME
  );

  await registerAccount({
    challengeId: firstChallenge.challengeId,
    registrationPayload: firstPayload.registrationPayload,
    serviceName: DEMO_SERVICE_NAME
  });

  const secondChallenge = await issueChallenge("signup");
  const secondPayload = await createDemoExtensionPayload(
    "signup",
    secondChallenge.challenge,
    DEMO_SERVICE_NAME
  );

  await assert.rejects(
    registerAccount({
      challengeId: secondChallenge.challengeId,
      registrationPayload: secondPayload.registrationPayload,
      serviceName: DEMO_SERVICE_NAME
    }),
    /Nullifier already registered/
  );
});

test("login rejects a tampered signature payload", async () => {
  const signupChallenge = await issueChallenge("signup");
  const signupPayload = await createDemoExtensionPayload(
    "signup",
    signupChallenge.challenge,
    DEMO_SERVICE_NAME
  );

  await registerAccount({
    challengeId: signupChallenge.challengeId,
    registrationPayload: signupPayload.registrationPayload,
    serviceName: DEMO_SERVICE_NAME
  });

  const loginChallenge = await issueChallenge("login");
  const loginPayload = await createDemoExtensionPayload(
    "login",
    loginChallenge.challenge,
    DEMO_SERVICE_NAME
  );
  const tamperedPayload = {
    ...loginPayload.loginPayload,
    signature: {
      ...loginPayload.loginPayload.signature,
      S: (BigInt(loginPayload.loginPayload.signature.S) + 1n).toString()
    }
  };

  await assert.rejects(
    loginAccount({
      challengeId: loginChallenge.challengeId,
      loginPayload: tamperedPayload,
      serviceName: DEMO_SERVICE_NAME
    }),
    /Login signature verification failed/
  );
});

test("payload request uses the extension response when available", async () => {
  const challengeData = {
    challenge: "signup-challenge",
    serviceName: DEMO_SERVICE_NAME
  };

  const result = await requestPayloadWithFallback("signup", challengeData, {
    fetchDemo: async () => {
      throw new Error("demo should not run");
    },
    requestExtension: async () => ({
      registrationPayload: { challenge: challengeData.challenge, ok: true }
    })
  });

  assert.equal(result.source, "extension");
  assert.deepEqual(result.payload, { challenge: challengeData.challenge, ok: true });
});

test("payload request falls back to demo generation when extension is unavailable", async () => {
  const challengeData = {
    challenge: "login-challenge",
    serviceName: DEMO_SERVICE_NAME
  };

  const result = await requestPayloadWithFallback("login", challengeData, {
    fetchDemo: async () => ({
      payload: { challenge: challengeData.challenge, fallback: true },
      source: "demo"
    }),
    requestExtension: async () => {
      throw new Error("No extension response received");
    }
  });

  assert.equal(result.source, "demo");
  assert.equal(result.fallbackReason, "No extension response received");
  assert.deepEqual(result.payload, { challenge: challengeData.challenge, fallback: true });
});
