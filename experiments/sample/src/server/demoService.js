"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const {
  DEFAULT_GROUP_SECRETS,
  createRegistryGroup,
  runLogicExperiment,
  verifyLoginPayload,
  verifyRegistrationPayload
} = require("../../../logic/src");
const { store } = require("./demoStore");

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

function consumeChallenge(challengeId, flow, serviceName, challenge) {
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

  entry.used = true;
  return entry;
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

  consumeChallenge(challengeId, "signup", serviceName, registrationPayload.challenge);

  const registryGroup = await getRegistryGroup();
  const isValid = await verifyRegistrationPayload(registrationPayload, {
    challenge: registrationPayload.challenge,
    groupContext: registryGroup,
    serviceName
  });

  if (!isValid) {
    throw new Error("Registration proof verification failed");
  }

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

  consumeChallenge(challengeId, "login", serviceName, loginPayload.challenge);

  const account = store.accounts.get(username);

  if (!account) {
    throw new Error("Unknown account");
  }

  const isValid = await verifyLoginPayload(loginPayload, {
    challenge: loginPayload.challenge,
    expectedSpkCommitment: account.spkCommitment,
    expectedSpkPublicKey: account.spkPublicKey
  });

  if (!isValid) {
    throw new Error("Login signature verification failed");
  }

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
