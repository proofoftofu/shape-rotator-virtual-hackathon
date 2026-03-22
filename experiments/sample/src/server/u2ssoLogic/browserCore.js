"use strict";

const { Group } = require("@semaphore-protocol/group");
const { Identity } = require("@semaphore-protocol/identity");
const { buildBabyjub } = require("circomlibjs");
const { generateProof, verifyProof } = require("@semaphore-protocol/proof");
const { encodeBytes32String, toBigInt } = require("ethers");
const { poseidon3 } = require("poseidon-lite");

const DEFAULT_SERVICE_NAME = "demo.service.local";
const DEFAULT_REGISTRATION_CHALLENGE = "register-demo-challenge";
const DEFAULT_LOGIN_CHALLENGE = "login-demo-challenge";
const DEFAULT_GROUP_SECRETS = [
  "11111111111111111111111111111111",
  "22222222222222222222222222222222",
  "33333333333333333333333333333333",
  "44444444444444444444444444444444"
];

function convertMessage(message) {
  try {
    return toBigInt(message);
  } catch (error) {
    return toBigInt(encodeBytes32String(message));
  }
}

async function createID(masterSecret) {
  return new Identity(masterSecret);
}

function deriveChildSecretKey(masterSecret, serviceName, count = 100) {
  const convertedName = convertMessage(serviceName);
  return poseidon3([masterSecret[1], convertedName, count]);
}

async function deriveChildPublicKey(childSecretKey) {
  const babyJub = await buildBabyjub();
  const field = babyJub.F;
  const baseG = [
    field.e("5299619240641551281634865583518297030282874472190772894086521144482721001553"),
    field.e("16950150798460657717958625567821834550301663161624707787222815936182638968203")
  ];

  return babyJub.addPoint(
    babyJub.Base8,
    babyJub.mulPointEscalar(baseG, childSecretKey)
  );
}

async function createSPK(masterSecret, serviceName) {
  const childSecretKey = deriveChildSecretKey(masterSecret, serviceName, 100);
  return new Identity(childSecretKey.toString());
}

async function authProof(masterSecret, challenge, serviceName) {
  const spk = await createSPK(masterSecret, serviceName);
  return spk.signMessage(challenge);
}

async function authVerify(spk, signature, challenge) {
  return Identity.verifySignature(challenge, signature, spk.publicKey);
}

async function proveMem(masterSecret, group, serviceName, challenge, snarkArtifacts) {
  const identity = new Identity(masterSecret);
  return generateProof(identity, group, challenge, serviceName, 2, snarkArtifacts);
}

async function verifyMem(proof, group, serviceName, challenge) {
  const isValid = await verifyProof(proof);
  const checkRoot = proof.merkleTreeRoot === group.root.toString();
  const checkMessage = proof.message === convertMessage(challenge).toString();
  const checkScope = proof.scope === convertMessage(serviceName).toString();

  return isValid && checkRoot && checkMessage && checkScope;
}

function parsePublicKeyString(publicKey) {
  if (Array.isArray(publicKey)) {
    return publicKey.map((value) => BigInt(value));
  }

  if (typeof publicKey !== "string" || publicKey.length === 0) {
    throw new Error("Public key must be a non-empty string or array");
  }

  return publicKey.split(",").map((value) => BigInt(value.trim()));
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

async function createRegistryGroup(groupSecrets = DEFAULT_GROUP_SECRETS) {
  const members = [];

  for (const secret of groupSecrets) {
    const identity = await createID(secret);
    members.push({
      secret,
      commitment: identity.commitment.toString()
    });
  }

  return {
    group: new Group(members.map((member) => member.commitment)),
    members
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

async function createRegistrationPayload(
  masterSecret,
  serviceName,
  challenge,
  groupContext,
  options = {}
) {
  const spk = await createSPK(masterSecret, serviceName);
  const proof = await proveMem(
    masterSecret,
    groupContext.group,
    serviceName,
    challenge,
    options.snarkArtifacts
  );
  const verified = await verifyMem(proof, groupContext.group, serviceName, challenge);
  const nullifier = proof.nullifier.toString();

  return {
    challenge,
    memberIndex: groupContext.memberIndex,
    groupRoot: groupContext.group.root.toString(),
    memberCommitments: groupContext.members.map((member) => member.commitment),
    spkCommitment: spk.commitment.toString(),
    spkPublicKey: spk.publicKey.toString(),
    nullifier,
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

async function verifyRegistrationPayload(payload, options = {}) {
  const serviceName = options.serviceName || payload.serviceName;
  const challenge = options.challenge || payload.challenge;
  const registryGroup = options.groupContext || await createRegistryGroup(options.groupSecrets);
  const expectedPublicKey = options.expectedSpkPublicKey;
  const expectedCommitment = options.expectedSpkCommitment;

  if (!payload || !payload.proof) {
    return false;
  }

  if (payload.challenge !== challenge) {
    return false;
  }

  if (payload.groupRoot !== registryGroup.group.root.toString()) {
    return false;
  }

  if (expectedPublicKey && payload.spkPublicKey !== expectedPublicKey) {
    return false;
  }

  if (expectedCommitment && payload.spkCommitment !== expectedCommitment) {
    return false;
  }

  return verifyMem(payload.proof, registryGroup.group, serviceName, challenge);
}

async function verifyLoginPayload(payload, options = {}) {
  const challenge = options.challenge || payload.challenge;
  const expectedPublicKey = options.expectedSpkPublicKey || payload.spkPublicKey;
  const expectedCommitment = options.expectedSpkCommitment;

  if (!payload || !payload.signature) {
    return false;
  }

  if (payload.challenge !== challenge) {
    return false;
  }

  if (expectedCommitment && payload.spkCommitment !== expectedCommitment) {
    return false;
  }

  if (payload.spkPublicKey !== expectedPublicKey) {
    return false;
  }

  return authVerify(
    { publicKey: parsePublicKeyString(expectedPublicKey) },
    {
      R8: payload.signature.R8.map((value) => BigInt(value)),
      S: BigInt(payload.signature.S)
    },
    challenge
  );
}

async function runBrowserLogicExperiment(options = {}) {
  const masterSecret = options.masterSecret;

  if (!masterSecret) {
    throw new Error("runBrowserLogicExperiment requires a masterSecret");
  }

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
    groupContext,
    { snarkArtifacts: options.snarkArtifacts }
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

module.exports = {
  DEFAULT_GROUP_SECRETS,
  DEFAULT_LOGIN_CHALLENGE,
  DEFAULT_REGISTRATION_CHALLENGE,
  DEFAULT_SERVICE_NAME,
  authProof,
  authVerify,
  buildGroup,
  convertMessage,
  createID,
  createLoginPayload,
  createRegistryGroup,
  createRegistrationPayload,
  createSPK,
  deriveChildCredential,
  deriveChildPublicKey,
  deriveChildSecretKey,
  deriveMasterIdentity,
  parsePublicKeyString,
  proveMem,
  runBrowserLogicExperiment,
  verifyLoginPayload,
  verifyMem,
  verifyRegistrationPayload
};
