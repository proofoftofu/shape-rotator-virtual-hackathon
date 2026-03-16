"use strict";

const crypto = require("node:crypto");

const DEFAULT_MASTER_SECRET_SEED = "shape-rotator-u2sso-logic-master-secret";
const DEFAULT_SERVICE_NAME = "demo.service.local";
const DEFAULT_REGISTRATION_CHALLENGE = "register-demo-challenge";
const DEFAULT_LOGIN_CHALLENGE = "login-demo-challenge";

function toBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }

  return Buffer.from(JSON.stringify(value), "utf8");
}

function sha256Hex(...values) {
  const hash = crypto.createHash("sha256");

  for (const value of values) {
    hash.update(toBuffer(value));
    hash.update(Buffer.from([0]));
  }

  return hash.digest("hex");
}

function hmacHex(keyHex, ...values) {
  const hmac = crypto.createHmac("sha256", Buffer.from(keyHex, "hex"));

  for (const value of values) {
    hmac.update(toBuffer(value));
    hmac.update(Buffer.from([0]));
  }

  return hmac.digest("hex");
}

function createDeterministicMasterSecret(seed = DEFAULT_MASTER_SECRET_SEED) {
  return sha256Hex("u2sso/master-secret", seed);
}

function deriveMasterIdentity(masterSecret) {
  return {
    commitment: sha256Hex("u2sso/master-identity/commitment", masterSecret),
    nullifierKey: hmacHex(masterSecret, "u2sso/master-identity/nullifier"),
    trapdoor: hmacHex(masterSecret, "u2sso/master-identity/trapdoor")
  };
}

function deriveChildCredential(masterSecret, serviceName) {
  const serviceDigest = sha256Hex("u2sso/service", serviceName);
  const childSecret = hmacHex(masterSecret, "u2sso/child-secret", serviceName);
  const childPublicKey = sha256Hex("u2sso/child-public", childSecret, serviceDigest);

  return {
    serviceDigest,
    childSecret,
    childPublicKey
  };
}

function createRegistrationPayload(masterSecret, masterIdentity, serviceName, childCredential, challenge) {
  const registrationProof = hmacHex(
    masterSecret,
    "u2sso/registration-proof",
    serviceName,
    challenge,
    masterIdentity.commitment,
    childCredential.childPublicKey
  );

  return {
    challenge,
    masterIdentityCommitment: masterIdentity.commitment,
    childPublicKey: childCredential.childPublicKey,
    registrationProof,
    registrationCommitment: sha256Hex(
      "u2sso/registration-commitment",
      registrationProof,
      childCredential.serviceDigest
    )
  };
}

function createLoginPayload(masterSecret, masterIdentity, serviceName, childCredential, challenge) {
  const loginProof = hmacHex(
    masterSecret,
    "u2sso/login-proof",
    serviceName,
    challenge,
    childCredential.childPublicKey
  );

  return {
    challenge,
    masterIdentityCommitment: masterIdentity.commitment,
    childPublicKey: childCredential.childPublicKey,
    loginProof,
    nullifier: sha256Hex(
      "u2sso/login-nullifier",
      serviceName,
      childCredential.childPublicKey
    ),
    challengeBinding: sha256Hex(
      "u2sso/login-binding",
      challenge,
      loginProof
    )
  };
}

function runLogicExperiment(options = {}) {
  const masterSecret = options.masterSecret || createDeterministicMasterSecret(options.masterSecretSeed);
  const serviceName = options.serviceName || DEFAULT_SERVICE_NAME;
  const registrationChallenge = options.registrationChallenge || DEFAULT_REGISTRATION_CHALLENGE;
  const loginChallenge = options.loginChallenge || DEFAULT_LOGIN_CHALLENGE;

  const masterIdentity = deriveMasterIdentity(masterSecret);
  const childCredential = deriveChildCredential(masterSecret, serviceName);
  const registrationPayload = createRegistrationPayload(
    masterSecret,
    masterIdentity,
    serviceName,
    childCredential,
    registrationChallenge
  );
  const loginPayload = createLoginPayload(
    masterSecret,
    masterIdentity,
    serviceName,
    childCredential,
    loginChallenge
  );

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
  DEFAULT_LOGIN_CHALLENGE,
  DEFAULT_MASTER_SECRET_SEED,
  DEFAULT_REGISTRATION_CHALLENGE,
  DEFAULT_SERVICE_NAME,
  createDeterministicMasterSecret,
  createLoginPayload,
  createRegistrationPayload,
  deriveChildCredential,
  deriveMasterIdentity,
  runLogicExperiment
};
