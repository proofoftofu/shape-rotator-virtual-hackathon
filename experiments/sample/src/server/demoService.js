"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const {
  DEFAULT_GROUP_SECRETS,
  createRegistryGroup,
  runLogicExperiment,
} = require("../../../logic/src");
const { store } = require("./demoStore");
const {
  verifyLoginInWorker,
  verifyRegistrationInWorker
} = require("./verifierClient");

const DEMO_SERVICE_NAME = "sample.service.local";
const DEMO_EXTENSION_MASTER_SECRET = DEFAULT_GROUP_SECRETS[0];
const DEMO_SEMAPHORE_ARTIFACTS = {
  wasm: path.resolve(process.cwd(), "..", "logic", "artifacts", "semaphore-2.wasm"),
  zkey: path.resolve(process.cwd(), "..", "logic", "artifacts", "semaphore-2.zkey")
};

let registryGroupPromise;

function getRegistryGroup() {
  if (!registryGroupPromise) {
    registryGroupPromise = createRegistryGroup(DEFAULT_GROUP_SECRETS);
  }

  return registryGroupPromise;
}

async function issueChallenge(flow, serviceName = DEMO_SERVICE_NAME) {
  if (flow !== "signup" && flow !== "login") {
    throw new Error(`Unsupported flow: ${flow}`);
  }

  const challengeId = crypto.randomUUID();
  const challenge = crypto.randomBytes(12).toString("hex");

  store.challenges.set(challengeId, {
    challenge,
    createdAt: Date.now(),
    flow,
    serviceName,
    used: false
  });

  return {
    challenge,
    challengeId,
    flow,
    serviceName
  };
}

function getChallengeEntry(challengeId, flow, serviceName, challenge) {
  const entry = store.challenges.get(challengeId);

  if (!entry) {
    throw new Error("Unknown challenge");
  }

  if (entry.used) {
    throw new Error("Challenge already used");
  }

  if (entry.flow !== flow) {
    throw new Error("Challenge flow mismatch");
  }

  if (entry.serviceName !== serviceName) {
    throw new Error("Service name mismatch");
  }

  if (entry.challenge !== challenge) {
    throw new Error("Challenge mismatch");
  }

  return entry;
}

function markChallengeUsed(entry) {
  entry.used = true;
}

function verifyRegistrationPayloadLite(registrationPayload, registryGroup, serviceName) {
  return Boolean(
    registrationPayload &&
      registrationPayload.verified === true &&
      registrationPayload.challenge &&
      registrationPayload.groupRoot === registryGroup.group.root.toString() &&
      registrationPayload.nullifier &&
      registrationPayload.spkCommitment &&
      registrationPayload.spkPublicKey &&
      Array.isArray(registrationPayload.memberCommitments) &&
      registrationPayload.memberCommitments.length > 0 &&
      registrationPayload.proof &&
      registrationPayload.proof.scope &&
      serviceName
  );
}

async function createDemoExtensionPayload(flow, challenge, serviceName = DEMO_SERVICE_NAME) {
  const result = await runLogicExperiment({
    groupSecrets: DEFAULT_GROUP_SECRETS,
    loginChallenge: challenge,
    masterSecret: DEMO_EXTENSION_MASTER_SECRET,
    registrationChallenge: challenge,
    serviceName,
    snarkArtifacts: DEMO_SEMAPHORE_ARTIFACTS
  });

  return flow === "signup"
    ? {
        masterIdentity: result.masterIdentity,
        registrationPayload: result.registrationPayload,
        serviceName: result.serviceName
      }
    : {
        loginPayload: result.loginPayload,
        serviceName: result.serviceName
      };
}

async function registerAccount({
  challengeId,
  registrationPayload,
  serviceName = DEMO_SERVICE_NAME,
  username
}) {
  if (!username) {
    throw new Error("Username is required");
  }

  console.log("[u2sso-sample][server] registerAccount start", {
    challengeId,
    serviceName,
    username
  });

  const challengeEntry = getChallengeEntry(
    challengeId,
    "signup",
    serviceName,
    registrationPayload.challenge
  );

  const registryGroup = await getRegistryGroup();
  console.log("[u2sso-sample][server] registerAccount verifying payload", {
    challengeId,
    groupRoot: registryGroup.group.root.toString(),
    nullifier: registrationPayload.nullifier,
    spkCommitment: registrationPayload.spkCommitment
  });
  let isValid;

  try {
    const verificationResult = await verifyRegistrationInWorker({
      challenge: registrationPayload.challenge,
      groupSecrets: DEFAULT_GROUP_SECRETS,
      payload: registrationPayload,
      serviceName
    });
    isValid = verificationResult.ok;
  } catch (error) {
    console.warn("[u2sso-sample][server] registerAccount worker verification unavailable, using lite checks", {
      error: error.message
    });
    isValid = verifyRegistrationPayloadLite(registrationPayload, registryGroup, serviceName);
  }

  if (!isValid) {
    throw new Error("Registration proof verification failed");
  }

  markChallengeUsed(challengeEntry);

  const nullifierKey = `${serviceName}:${registrationPayload.nullifier}`;

  if (store.nullifiers.has(nullifierKey)) {
    throw new Error("Nullifier already registered for this service");
  }

  const account = {
    createdAt: Date.now(),
    nullifier: registrationPayload.nullifier,
    serviceName,
    spkCommitment: registrationPayload.spkCommitment,
    spkPublicKey: registrationPayload.spkPublicKey,
    username
  };

  store.accounts.set(username, account);
  store.nullifiers.set(nullifierKey, username);

  console.log("[u2sso-sample][server] registerAccount success", {
    challengeId,
    serviceName,
    username
  });

  return account;
}

async function loginAccount({
  challengeId,
  loginPayload,
  serviceName = DEMO_SERVICE_NAME,
  username
}) {
  if (!username) {
    throw new Error("Username is required");
  }

  console.log("[u2sso-sample][server] loginAccount start", {
    challengeId,
    serviceName,
    username
  });

  const challengeEntry = getChallengeEntry(
    challengeId,
    "login",
    serviceName,
    loginPayload.challenge
  );

  const account = store.accounts.get(username);

  if (!account) {
    throw new Error("Unknown account");
  }

  const verificationResult = await verifyLoginInWorker({
    challenge: loginPayload.challenge,
    expectedSpkCommitment: account.spkCommitment,
    expectedSpkPublicKey: account.spkPublicKey,
    payload: loginPayload
  });
  const isValid = verificationResult.ok;

  if (!isValid) {
    throw new Error("Login signature verification failed");
  }

  markChallengeUsed(challengeEntry);

  const sessionToken = crypto.randomUUID();
  store.sessions.set(sessionToken, {
    createdAt: Date.now(),
    serviceName,
    username
  });

  return {
    serviceName,
    sessionToken,
    username
  };
}

function getDebugState() {
  return {
    accounts: Array.from(store.accounts.values()),
    challenges: Array.from(store.challenges.entries()).map(([challengeId, value]) => ({
      challengeId,
      ...value
    })),
    sessions: Array.from(store.sessions.entries()).map(([sessionToken, value]) => ({
      sessionToken,
      ...value
    }))
  };
}

module.exports = {
  DEMO_EXTENSION_MASTER_SECRET,
  DEMO_SEMAPHORE_ARTIFACTS,
  DEMO_SERVICE_NAME,
  createDemoExtensionPayload,
  getDebugState,
  issueChallenge,
  loginAccount,
  registerAccount
};
