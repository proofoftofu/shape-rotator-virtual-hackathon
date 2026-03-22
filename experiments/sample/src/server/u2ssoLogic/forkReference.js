"use strict";

const path = require("node:path");
const { poseidon3 } = require("poseidon-lite");
const { Identity } = require("@semaphore-protocol/identity");
const { buildBabyjub } = require("circomlibjs");
const { generateProof, verifyProof } = require("@semaphore-protocol/proof");
const { encodeBytes32String, toBigInt } = require("ethers");

function createLocalSemaphoreArtifacts(baseDir = __dirname) {
  return {
    wasm: path.join(baseDir, "..", "artifacts", "semaphore-2.wasm"),
    zkey: path.join(baseDir, "..", "artifacts", "semaphore-2.zkey")
  };
}

const LOCAL_SEMAPHORE_ARTIFACTS = createLocalSemaphoreArtifacts();

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

function deriveChildSecretKey(masterSecret, serviceName, count) {
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

async function proveMem(masterSecret, group, serviceName, challenge, snarkArtifacts = LOCAL_SEMAPHORE_ARTIFACTS) {
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

module.exports = {
  authProof,
  authVerify,
  createLocalSemaphoreArtifacts,
  convertMessage,
  createID,
  createSPK,
  deriveChildPublicKey,
  deriveChildSecretKey,
  LOCAL_SEMAPHORE_ARTIFACTS,
  proveMem,
  verifyMem
};
