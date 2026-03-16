"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  authProof,
  authVerify,
  createID,
  createSPK,
  deriveChildSecretKey,
  proveMem,
  verifyMem
} = require("../src/forkReference");
const {
  buildGroup,
  createLoginPayload,
  createPasskey,
  createRegistrationPayload,
  deriveChildCredential,
  deriveMasterIdentity,
  loadPasskey,
  masterSecretBytesToForkSecret,
  runLogicExperiment
} = require("../src");

test("passkey creation and loading preserve the raw 32-byte secret", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "u2sso-logic-passkey-"));
  const passkeyPath = path.join(tempDir, "passkey.bin");

  const created = await createPasskey(passkeyPath);
  const loaded = await loadPasskey(passkeyPath);

  assert.equal(created.length, 32);
  assert.deepEqual(loaded, created);
});

test("master identity derivation matches the forked createID semantics", async () => {
  const masterSecret = "11111111111111111111111111111111";

  const derived = await deriveMasterIdentity(masterSecret);
  const reference = await createID(masterSecret);

  assert.equal(derived.commitment, reference.commitment.toString());
  assert.deepEqual(derived.publicKey, reference.publicKey.map((value) => value.toString()));
  assert.equal(derived.secretScalar, reference.secretScalar.toString());
});

test("child credential derivation matches the forked child-key logic", async () => {
  const masterSecret = "11111111111111111111111111111111";
  const serviceName = "demo.service.local";

  const derived = await deriveChildCredential(masterSecret, serviceName);
  const childSecretKey = deriveChildSecretKey(masterSecret, serviceName, 100);
  const spk = await createSPK(masterSecret, serviceName);

  assert.equal(derived.childSecretKey, childSecretKey.toString());
  assert.equal(derived.spkCommitment, spk.commitment.toString());
  assert.equal(derived.spkPublicKey, spk.publicKey.toString());
});

test("registration payload verifies against the forked Semaphore membership flow", async () => {
  const masterSecret = "11111111111111111111111111111111";
  const serviceName = "demo.service.local";
  const challenge = "register-demo-challenge";
  const groupContext = await buildGroup(masterSecret);

  const payload = await createRegistrationPayload(masterSecret, serviceName, challenge, groupContext);
  const referenceProof = await proveMem(masterSecret, groupContext.group, serviceName, challenge);
  const referenceVerified = await verifyMem(referenceProof, groupContext.group, serviceName, challenge);

  assert.equal(payload.verified, true);
  assert.equal(referenceVerified, true);
  assert.equal(payload.groupRoot, groupContext.group.root.toString());
  assert.equal(payload.spkPublicKey.length > 0, true);
  assert.equal(payload.nullifier, referenceProof.nullifier.toString());
  assert.equal(payload.proof.merkleTreeRoot, referenceProof.merkleTreeRoot);
  assert.equal(payload.proof.scope, referenceProof.scope);
  assert.equal(payload.proof.message, referenceProof.message);
});

test("registration nullifier stays the same for the same master secret and service name", async () => {
  const masterSecret = "11111111111111111111111111111111";
  const serviceName = "demo.service.local";
  const groupContext = await buildGroup(masterSecret);

  const first = await createRegistrationPayload(
    masterSecret,
    serviceName,
    "register-demo-challenge-1",
    groupContext
  );
  const second = await createRegistrationPayload(
    masterSecret,
    serviceName,
    "register-demo-challenge-2",
    groupContext
  );

  assert.equal(first.nullifier, second.nullifier);
  assert.equal(first.proof.nullifier.toString(), second.proof.nullifier.toString());
});

test("registration nullifier changes when the service name changes", async () => {
  const masterSecret = "11111111111111111111111111111111";
  const groupContext = await buildGroup(masterSecret);

  const first = await createRegistrationPayload(
    masterSecret,
    "demo.service.local",
    "register-demo-challenge",
    groupContext
  );
  const second = await createRegistrationPayload(
    masterSecret,
    "another.service.local",
    "register-demo-challenge",
    groupContext
  );

  assert.notEqual(first.nullifier, second.nullifier);
  assert.notEqual(first.proof.nullifier.toString(), second.proof.nullifier.toString());
});

test("login payload verifies against the forked service-key auth flow", async () => {
  const masterSecret = "11111111111111111111111111111111";
  const serviceName = "demo.service.local";
  const challenge = "login-demo-challenge";

  const payload = await createLoginPayload(masterSecret, serviceName, challenge);
  const spk = await createSPK(masterSecret, serviceName);
  const referenceSignature = await authProof(masterSecret, challenge, serviceName);
  const referenceVerified = await authVerify(spk, referenceSignature, challenge);

  assert.equal(payload.verified, true);
  assert.equal(referenceVerified, true);
  assert.equal(payload.spkCommitment, spk.commitment.toString());
  assert.deepEqual(payload.signature, {
    R8: referenceSignature.R8.map((value) => value.toString()),
    S: referenceSignature.S.toString()
  });
});

test("runLogicExperiment returns the required structure using the real proof flow", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "u2sso-logic-run-"));
  const passkeyPath = path.join(tempDir, "passkey.bin");
  const passkeyBytes = Buffer.from("11111111111111111111111111111111", "utf8");
  await fs.writeFile(passkeyPath, passkeyBytes);

  const result = await runLogicExperiment({ passkeyPath });

  assert.equal(result.masterSecret, masterSecretBytesToForkSecret(passkeyBytes));
  assert.equal(result.registrationPayload.verified, true);
  assert.equal(result.loginPayload.verified, true);
  assert.equal(typeof result.registrationPayload.nullifier, "string");
  assert.equal(typeof result.registrationPayload.proof.merkleTreeRoot, "string");
  assert.equal(typeof result.loginPayload.signature.S, "string");
  assert.equal(Array.isArray(result.loginPayload.signature.R8), true);
});

test("CLI prints valid JSON for the real proof flow", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "u2sso-logic-cli-"));
  const passkeyPath = path.join(tempDir, "passkey.bin");
  await fs.writeFile(passkeyPath, Buffer.from("11111111111111111111111111111111", "utf8"));

  const cliPath = path.join(__dirname, "..", "cli.js");
  const output = spawnSync(process.execPath, [cliPath, `--passkey-path=${passkeyPath}`], {
    encoding: "utf8"
  });

  assert.equal(output.status, 0, output.stderr);

  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.registrationPayload.verified, true);
  assert.equal(parsed.loginPayload.verified, true);
  assert.equal(typeof parsed.registrationPayload.nullifier, "string");
  assert.equal(typeof parsed.childCredential.spkPublicKey, "string");
});
