import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { buildBabyjub } from "circomlibjs";
import { generateProof, verifyProof } from "@semaphore-protocol/proof";
import { encodeBytes32String, toBigInt } from "ethers";
import { poseidon3 } from "poseidon-lite";

export const DEFAULT_SERVICE_NAME = "demo.service.local";
export const DEFAULT_REGISTRATION_CHALLENGE = "register-demo-challenge";
export const DEFAULT_LOGIN_CHALLENGE = "login-demo-challenge";
export const DEFAULT_GROUP_SECRETS = [
  "11111111111111111111111111111111",
  "22222222222222222222222222222222",
  "33333333333333333333333333333333",
  "44444444444444444444444444444444"
];

export function convertMessage(message) {
  try {
    return toBigInt(message);
  } catch (error) {
    return toBigInt(encodeBytes32String(message));
  }
}

export async function createID(masterSecret) {
  return new Identity(masterSecret);
}

export function deriveChildSecretKey(masterSecret, serviceName, count = 100) {
  const convertedName = convertMessage(serviceName);
  return poseidon3([masterSecret[1], convertedName, count]);
}

export async function deriveChildPublicKey(childSecretKey) {
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

export async function createSPK(masterSecret, serviceName) {
  const childSecretKey = deriveChildSecretKey(masterSecret, serviceName, 100);
  return new Identity(childSecretKey.toString());
}

export async function authProof(masterSecret, challenge, serviceName) {
  const spk = await createSPK(masterSecret, serviceName);
  return spk.signMessage(challenge);
}

export async function authVerify(spk, signature, challenge) {
  return Identity.verifySignature(challenge, signature, spk.publicKey);
}

export async function proveMem(masterSecret, group, serviceName, challenge, snarkArtifacts) {
  const identity = new Identity(masterSecret);
  return generateProof(identity, group, challenge, serviceName, 2, snarkArtifacts);
}

export async function verifyMem(proof, group, serviceName, challenge) {
  const isValid = await verifyProof(proof);
  const checkRoot = proof.merkleTreeRoot === group.root.toString();
  const checkMessage = proof.message === convertMessage(challenge).toString();
  const checkScope = proof.scope === convertMessage(serviceName).toString();

  return isValid && checkRoot && checkMessage && checkScope;
}

export function parsePublicKeyString(publicKey) {
  if (Array.isArray(publicKey)) {
    return publicKey.map((value) => BigInt(value));
  }

  if (typeof publicKey !== "string" || publicKey.length === 0) {
    throw new Error("Public key must be a non-empty string or array");
  }

  return publicKey.split(",").map((value) => BigInt(value.trim()));
}

export async function deriveMasterIdentity(masterSecret) {
  const identity = await createID(masterSecret);

  return {
    privateKey: masterSecret,
    secretScalar: identity.secretScalar.toString(),
    commitment: identity.commitment.toString(),
    publicKey: identity.publicKey.map((value) => value.toString())
  };
}

export async function buildGroup(masterSecret, groupSecrets = DEFAULT_GROUP_SECRETS) {
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

export async function createRegistryGroupFromEntries(registryEntries = []) {
  const members = [];

  for (const entry of registryEntries) {
    if (entry.commitment === undefined || entry.commitment === null) {
      throw new Error("Registry entry is missing a commitment");
    }
    members.push({
      commitment: entry.commitment.toString(),
      id: entry.id,
      id33: entry.id33,
      secret: entry.commitment.toString()
    });
  }

  return {
    group: new Group(members.map((member) => member.commitment)),
    members
  };
}

export async function buildGroupFromRegistryEntries(masterIdentity, registryEntries = []) {
  const registryGroup = await createRegistryGroupFromEntries(registryEntries);
  const memberIndex = registryGroup.members.findIndex(
    (member) => member.commitment === masterIdentity.commitment.toString()
  );

  if (memberIndex < 0) {
    throw new Error("Master identity is not present in the on-chain registry list");
  }

  return {
    group: registryGroup.group,
    members: registryGroup.members,
    memberIndex
  };
}

export async function createRegistryGroup(groupSecrets = DEFAULT_GROUP_SECRETS) {
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

export async function deriveChildCredential(masterSecret, serviceName) {
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

export async function createRegistrationPayload(
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

export async function createLoginPayload(masterSecret, serviceName, challenge) {
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

export async function verifyRegistrationPayload(payload, options = {}) {
  const serviceName = options.serviceName || payload.serviceName;
  const challenge = options.challenge || payload.challenge;
  const registryGroup =
    options.groupContext ||
    (options.registryEntries
      ? await createRegistryGroupFromEntries(options.registryEntries)
      : await createRegistryGroup(options.groupSecrets));
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

export async function verifyLoginPayload(payload, options = {}) {
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

export async function runBrowserLogicExperiment(options = {}) {
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

const browserCore = {
  DEFAULT_GROUP_SECRETS,
  DEFAULT_LOGIN_CHALLENGE,
  DEFAULT_REGISTRATION_CHALLENGE,
  DEFAULT_SERVICE_NAME,
  authProof,
  authVerify,
  buildGroup,
  buildGroupFromRegistryEntries,
  convertMessage,
  createID,
  createLoginPayload,
  createRegistryGroup,
  createRegistryGroupFromEntries,
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

export default browserCore;
