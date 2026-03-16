"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const {
  createDeterministicMasterSecret,
  deriveChildCredential,
  runLogicExperiment
} = require("../src/logic");

test("runLogicExperiment returns the required top-level structure", () => {
  const result = runLogicExperiment();

  assert.equal(typeof result.masterSecret, "string");
  assert.equal(typeof result.masterIdentity, "object");
  assert.equal(typeof result.serviceName, "string");
  assert.equal(typeof result.childCredential, "object");
  assert.equal(typeof result.registrationPayload, "object");
  assert.equal(typeof result.loginPayload, "object");
});

test("derivation is deterministic for the same inputs", () => {
  const masterSecret = createDeterministicMasterSecret("fixed-seed");
  const first = runLogicExperiment({
    masterSecret,
    serviceName: "service-a",
    registrationChallenge: "reg-a",
    loginChallenge: "login-a"
  });
  const second = runLogicExperiment({
    masterSecret,
    serviceName: "service-a",
    registrationChallenge: "reg-a",
    loginChallenge: "login-a"
  });

  assert.deepEqual(second, first);
});

test("child credentials change when the service name changes", () => {
  const masterSecret = createDeterministicMasterSecret("fixed-seed");
  const serviceA = deriveChildCredential(masterSecret, "service-a");
  const serviceB = deriveChildCredential(masterSecret, "service-b");

  assert.notEqual(serviceA.childSecret, serviceB.childSecret);
  assert.notEqual(serviceA.childPublicKey, serviceB.childPublicKey);
});

test("registration and login payloads stay separated", () => {
  const result = runLogicExperiment();

  assert.notEqual(
    result.registrationPayload.registrationProof,
    result.loginPayload.loginProof
  );
  assert.notEqual(
    result.registrationPayload.challenge,
    result.loginPayload.challenge
  );
  assert.equal(
    result.registrationPayload.childPublicKey,
    result.loginPayload.childPublicKey
  );
});

test("CLI script prints valid JSON with the expected shape", () => {
  const entryPath = path.join(__dirname, "..", "index.js");
  const output = spawnSync(process.execPath, [entryPath], { encoding: "utf8" });

  assert.equal(output.status, 0, output.stderr);

  const parsed = JSON.parse(output.stdout);

  assert.equal(typeof parsed.masterSecret, "string");
  assert.equal(parsed.serviceName.length > 0, true);
  assert.equal(typeof parsed.registrationPayload.registrationProof, "string");
  assert.equal(typeof parsed.loginPayload.loginProof, "string");
});
