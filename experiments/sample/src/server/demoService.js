"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { store } = require("./demoStore");
const { getLogicModule } = require("./logicRuntime");

const DEMO_SERVICE_NAME = "sample.service.local";
const {
  DEFAULT_GROUP_SECRETS,
  createRegistryGroup,
  createRegistryGroupFromEntries,
  runLogicExperiment,
  verifyLoginPayload,
  verifyRegistrationPayload
} = getLogicModule();
const contractClient = require("./contractClient");
const DEMO_EXTENSION_MASTER_SECRET = DEFAULT_GROUP_SECRETS[0];
const DEMO_SEMAPHORE_ARTIFACTS = {
  wasm: path.resolve(process.cwd(), "..", "logic", "artifacts", "semaphore-2.wasm"),
  zkey: path.resolve(process.cwd(), "..", "logic", "artifacts", "semaphore-2.zkey")
};

async function getRegistryGroup() {
  const hasContractConfig = Boolean(
    process.env.U2SSO_SAMPLE_RPC_URL ||
    process.env.U2SSO_SAMPLE_PRC_URL ||
    process.env.U2SSO_PRC ||
    process.env.PRC ||
    process.env.U2SSO_SAMPLE_PRIVATE_KEY ||
    process.env.U2SSO_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    process.env.U2SSO_SAMPLE_REGISTRY_ADDRESS ||
    process.env.U2SSO_ADDRESS
  );

  return hasContractConfig
    ? contractClient
        .getActiveIdentities()
        .then((identities) => createRegistryGroupFromEntries(identities))
    : createRegistryGroup(DEFAULT_GROUP_SECRETS);
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
  serviceName = DEMO_SERVICE_NAME
}) {
  console.log("[u2sso-sample][server] registerAccount start", {
    challengeId,
    serviceName,
    spkCommitment: registrationPayload?.spkCommitment,
    spkPublicKey: registrationPayload?.spkPublicKey
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
  console.log("[u2sso-sample][server] registerAccount using in-process verification");
  const isValid = await verifyRegistrationPayload(registrationPayload, {
    challenge: registrationPayload.challenge,
    groupContext: registryGroup,
    serviceName
  });

  if (!isValid) {
    throw new Error("Registration proof verification failed");
  }

  markChallengeUsed(challengeEntry);

  const nullifierKey = `${serviceName}:${registrationPayload.nullifier}`;
  const accountKey = `${serviceName}:${registrationPayload.spkPublicKey}`;

  if (store.nullifiers.has(nullifierKey)) {
    throw new Error("Nullifier already registered for this service");
  }

  if (store.accounts.has(accountKey)) {
    throw new Error("Child public key already registered for this service");
  }

  const account = {
    accountKey,
    createdAt: Date.now(),
    nullifier: registrationPayload.nullifier,
    serviceName,
    spkCommitment: registrationPayload.spkCommitment,
    spkPublicKey: registrationPayload.spkPublicKey
  };

  store.accounts.set(accountKey, account);
  store.nullifiers.set(nullifierKey, accountKey);

  console.log("[u2sso-sample][server] registerAccount success", {
    challengeId,
    serviceName,
    spkPublicKey: account.spkPublicKey
  });

  return account;
}

async function loginAccount({
  challengeId,
  loginPayload,
  serviceName = DEMO_SERVICE_NAME
}) {
  console.log("[u2sso-sample][server] loginAccount start", {
    challengeId,
    serviceName,
    spkPublicKey: loginPayload?.spkPublicKey
  });

  const challengeEntry = getChallengeEntry(
    challengeId,
    "login",
    serviceName,
    loginPayload.challenge
  );

  const accountKey = `${serviceName}:${loginPayload.spkPublicKey}`;
  const account = store.accounts.get(accountKey);

  if (!account) {
    throw new Error("Unknown child public key");
  }

  console.log("[u2sso-sample][server] loginAccount using in-process verification");
  const isValid = await verifyLoginPayload(loginPayload, {
    challenge: loginPayload.challenge,
    expectedSpkCommitment: account.spkCommitment,
    expectedSpkPublicKey: account.spkPublicKey
  });

  if (!isValid) {
    throw new Error("Login signature verification failed");
  }

  markChallengeUsed(challengeEntry);

  const sessionToken = crypto.randomUUID();
  store.sessions.set(sessionToken, {
    accountKey,
    createdAt: Date.now(),
    serviceName,
    spkPublicKey: account.spkPublicKey
  });

  return {
    accountKey,
    serviceName,
    sessionToken,
    spkPublicKey: account.spkPublicKey
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
