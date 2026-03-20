import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

import {
  STORAGE_KEY,
  createOrLoadIdentity,
  getStoredIdentity,
  masterSecretHexToDecimal,
  removeStoredIdentity,
  resolveSnarkArtifacts,
  runExtensionExperiment
} from "../src/experimentController.js";

const require = createRequire(import.meta.url);
const logicExperiment = require("../../logic/src/index.js");

function createMemoryStorage(initialEntries = {}) {
  const state = new Map(Object.entries(initialEntries));

  return {
    async get(key) {
      return { [key]: state.get(key) };
    },
    async set(entries) {
      for (const [entryKey, entryValue] of Object.entries(entries)) {
        state.set(entryKey, entryValue);
      }
    }
  };
}

function fixtureSnarkArtifacts() {
  return {
    wasm: path.resolve(process.cwd(), "../logic/artifacts/semaphore-2.wasm"),
    zkey: path.resolve(process.cwd(), "../logic/artifacts/semaphore-2.zkey")
  };
}

test("createOrLoadIdentity persists a 32-byte master secret in storage", async () => {
  const storage = createMemoryStorage();
  const result = await createOrLoadIdentity({
    storage,
    masterSecretHex: "11".repeat(32)
  });

  assert.equal(result.created, true);
  assert.equal(result.masterSecretHex, "11".repeat(32));
  assert.equal(result.masterSecret, masterSecretHexToDecimal("11".repeat(32)));

  const stored = await storage.get(STORAGE_KEY);
  assert.equal(stored[STORAGE_KEY], "11".repeat(32));
});

test("removeStoredIdentity clears the stored master secret and allows recreation", async () => {
  const storage = createMemoryStorage({ [STORAGE_KEY]: "11".repeat(32) });

  const existing = await getStoredIdentity({ storage });
  assert.equal(existing?.masterSecretHex, "11".repeat(32));

  await removeStoredIdentity({ storage });
  const cleared = await getStoredIdentity({ storage });
  assert.equal(cleared, null);

  const recreated = await createOrLoadIdentity({
    storage,
    masterSecretHex: "22".repeat(32)
  });

  assert.equal(recreated.created, true);
  assert.equal(recreated.masterSecretHex, "22".repeat(32));
});

test("runExtensionExperiment matches the existing logic experiment outputs", async () => {
  const masterSecretHex = Buffer.from("11111111111111111111111111111111", "utf8").toString("hex");
  const storage = createMemoryStorage({ [STORAGE_KEY]: masterSecretHex });
  const snarkArtifacts = fixtureSnarkArtifacts();
  const serviceName = "demo.service.local";
  const registrationChallenge = "register-demo-challenge";
  const loginChallenge = "login-demo-challenge";

  const extensionResult = await runExtensionExperiment({
    storage,
    serviceName,
    registrationChallenge,
    loginChallenge,
    snarkArtifacts
  });

  const logicResult = await logicExperiment.runLogicExperiment({
    passkeyBytes: Buffer.from(masterSecretHex, "hex"),
    serviceName,
    registrationChallenge,
    loginChallenge
  });

  assert.equal(extensionResult.masterSecret, logicResult.masterSecret);
  assert.deepEqual(extensionResult.masterIdentity, logicResult.masterIdentity);
  assert.deepEqual(extensionResult.childCredential, logicResult.childCredential);
  assert.equal(
    extensionResult.registrationPayload.nullifier,
    logicResult.registrationPayload.nullifier
  );
  assert.deepEqual(extensionResult.loginPayload.signature, logicResult.loginPayload.signature);
  assert.equal(extensionResult.registrationPayload.verified, true);
  assert.equal(extensionResult.loginPayload.verified, true);
});

test("resolveSnarkArtifacts points at extension-packaged artifacts", () => {
  assert.deepEqual(resolveSnarkArtifacts("chrome-extension://test-id/"), {
    wasm: "chrome-extension://test-id/artifacts/semaphore-2.wasm",
    zkey: "chrome-extension://test-id/artifacts/semaphore-2.zkey"
  });
});
