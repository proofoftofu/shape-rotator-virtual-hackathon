"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Group } = require("@semaphore-protocol/group");
const {
  authProof,
  authVerify,
  createID,
  createSPK,
  deriveChildPublicKey,
  deriveChildSecretKey,
  proveMem,
  verifyMem
} = require("./forkReference");

const DEFAULT_MASTER_SECRET_PATH = path.join(__dirname, "..", "fixtures", "master-secret.bin");
const DEFAULT_SERVICE_NAME = "demo.service.local";
const DEFAULT_REGISTRATION_CHALLENGE = "register-demo-challenge";
const DEFAULT_LOGIN_CHALLENGE = "login-demo-challenge";
const DEFAULT_GROUP_SECRETS = [
  "11111111111111111111111111111111",
  "22222222222222222222222222222222",
  "33333333333333333333333333333333",
  "44444444444444444444444444444444"
];

function randomMasterSecretBytes() {
  return crypto.randomBytes(32);
}

function bufferToHex(buffer) {
  return Buffer.from(buffer).toString("hex");
}

function hexToBuffer(hex) {
  return Buffer.from(hex, "hex");
}

async function createPasskey(filePath) {
  const passkey = randomMasterSecretBytes();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, passkey);
  return passkey;
}

async function loadPasskey(filePath) {
  const passkey = await fs.readFile(filePath);

  if (passkey.length === 0) {
    throw new Error(`Passkey file is empty: ${filePath}`);
  }

  return passkey;
}

async function createOrLoadPasskey(filePath = DEFAULT_MASTER_SECRET_PATH) {
  try {
    return await loadPasskey(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return createPasskey(filePath);
    }

    throw error;
  }
}

function masterSecretBytesToForkSecret(masterSecretBytes) {
  return BigInt(`0x${bufferToHex(masterSecretBytes)}`).toString(10);
}

async function deriveMasterIdentity(masterSecret) {
  const identity = await createID(masterSecret);

  return {
    privateKey: masterSecret,
    secretScalar: identity.secretScalar.toString(),
    commitment: identity.commitment.toString(),
    publicKey: identity.publicKey.map((value) => value.toString())
  };
}

async function buildGroup(masterSecret, groupSecrets = DEFAULT_GROUP_SECRETS) {
  const members = [];
  const normalizedSecrets = [...groupSecrets];

  if (!normalizedSecrets.includes(masterSecret)) {
    normalizedSecrets[0] = masterSecret;
  }

  for (const secret of normalizedSecrets) {
    const identity = await createID(secret);
    members.push({
      secret,
      commitment: identity.commitment.toString()
    });
  }

  const group = new Group(members.map((member) => member.commitment));
  const memberIndex = members.findIndex((member) => member.secret === masterSecret);

  return {
    group,
    members,
    memberIndex
  };
}

async function deriveChildCredential(masterSecret, serviceName) {
  const childSecretKey = deriveChildSecretKey(masterSecret, serviceName, 100);
  const childPublicKeyPoint = await deriveChildPublicKey(childSecretKey);
  const spk = await createSPK(masterSecret, serviceName);

  return {
    childSecretKey: childSecretKey.toString(),
    childPublicKeyPoint: childPublicKeyPoint.map((value) => value.toString()),
    spkCommitment: spk.commitment.toString(),
    spkPublicKey: spk.publicKey.toString()
  };
}

async function createRegistrationPayload(masterSecret, serviceName, challenge, groupContext) {
  const spk = await createSPK(masterSecret, serviceName);
  const proof = await proveMem(masterSecret, groupContext.group, serviceName, challenge);
  const verified = await verifyMem(proof, groupContext.group, serviceName, challenge);

  return {
    challenge,
    memberIndex: groupContext.memberIndex,
    groupRoot: groupContext.group.root.toString(),
    memberCommitments: groupContext.members.map((member) => member.commitment),
    spkCommitment: spk.commitment.toString(),
    spkPublicKey: spk.publicKey.toString(),
    proof,
    verified
  };
}

async function createLoginPayload(masterSecret, serviceName, challenge) {
  const spk = await createSPK(masterSecret, serviceName);
  const signature = await authProof(masterSecret, challenge, serviceName);
  const verified = await authVerify(spk, signature, challenge);

  return {
    challenge,
    spkCommitment: spk.commitment.toString(),
    spkPublicKey: spk.publicKey.toString(),
    signature: {
      R8: signature.R8.map((value) => value.toString()),
      S: signature.S.toString()
    },
    verified
  };
}

async function runLogicExperiment(options = {}) {
  const passkeyPath = options.passkeyPath || DEFAULT_MASTER_SECRET_PATH;
  const passkeyBytes = options.passkeyBytes || await createOrLoadPasskey(passkeyPath);
  const masterSecret = options.masterSecret || masterSecretBytesToForkSecret(passkeyBytes);
  const serviceName = options.serviceName || DEFAULT_SERVICE_NAME;
  const registrationChallenge = options.registrationChallenge || DEFAULT_REGISTRATION_CHALLENGE;
  const loginChallenge = options.loginChallenge || DEFAULT_LOGIN_CHALLENGE;

  const masterIdentity = await deriveMasterIdentity(masterSecret);
  const groupContext = await buildGroup(masterSecret, options.groupSecrets);
  const childCredential = await deriveChildCredential(masterSecret, serviceName);
  const registrationPayload = await createRegistrationPayload(
    masterSecret,
    serviceName,
    registrationChallenge,
    groupContext
  );
  const loginPayload = await createLoginPayload(masterSecret, serviceName, loginChallenge);

  return {
    masterSecret,
    masterIdentity,
    serviceName,
    childCredential,
    registrationPayload,
    loginPayload
  };
}

function toJsonSafe(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)])
    );
  }

  return value;
}

module.exports = {
  DEFAULT_GROUP_SECRETS,
  DEFAULT_LOGIN_CHALLENGE,
  DEFAULT_MASTER_SECRET_PATH,
  DEFAULT_REGISTRATION_CHALLENGE,
  DEFAULT_SERVICE_NAME,
  buildGroup,
  createLoginPayload,
  createOrLoadPasskey,
  createPasskey,
  createRegistrationPayload,
  deriveChildCredential,
  deriveMasterIdentity,
  hexToBuffer,
  loadPasskey,
  masterSecretBytesToForkSecret,
  runLogicExperiment,
  toJsonSafe
};
