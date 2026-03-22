"use strict";

const fs = require("node:fs");
const { Contract, JsonRpcProvider, Wallet } = require("ethers");

const DEFAULT_DEPLOYMENT = require("./artifacts/U2SSORegistry.deployment.json");
const DEFAULT_ABI = require("./artifacts/U2SSORegistry.json").abi;

function readDeploymentFile(deploymentPath) {
  const raw = fs.readFileSync(deploymentPath, "utf8");
  return JSON.parse(raw);
}

function getRegistryConfig() {
  const source = process.env.U2SSO_SAMPLE_REGISTRY_SOURCE || "local";
  const rpcUrl =
    process.env.U2SSO_SAMPLE_RPC_URL ||
    process.env.U2SSO_RPC ||
    process.env.RPC;
  const privateKey =
    process.env.U2SSO_SAMPLE_PRIVATE_KEY ||
    process.env.U2SSO_PRIVATE_KEY ||
    process.env.PRIVATE_KEY;
  const deploymentPath = process.env.U2SSO_SAMPLE_REGISTRY_DEPLOYMENT || null;
  const address = process.env.U2SSO_SAMPLE_REGISTRY_ADDRESS || process.env.U2SSO_ADDRESS;

  if (!rpcUrl) {
    throw new Error("Missing RPC URL env var: U2SSO_SAMPLE_RPC_URL");
  }

  if (!privateKey) {
    throw new Error("Missing signer env var: U2SSO_SAMPLE_PRIVATE_KEY");
  }

  const deployment = deploymentPath ? (fs.existsSync(deploymentPath) ? readDeploymentFile(deploymentPath) : null) : DEFAULT_DEPLOYMENT;
  const resolvedAddress = address || deployment?.address;

  if (!resolvedAddress) {
    throw new Error(`Missing contract address in deployment file: ${deploymentPath}`);
  }

  return {
    address: resolvedAddress,
    deploymentPath,
    privateKey,
    rpcUrl,
    source
  };
}

function toRegistryContract() {
  const config = getRegistryConfig();
  const provider = new JsonRpcProvider(config.rpcUrl);
  const wallet = new Wallet(config.privateKey, provider);
  const contract = new Contract(config.address, DEFAULT_ABI, wallet);

  return { contract, provider, wallet };
}

async function registerMasterIdentity(masterIdentity) {
  const { contract } = toRegistryContract();
  const [id, id33] = masterIdentity.publicKey;
  const commitment = masterIdentity.commitment;

  const tx = await contract.addID(BigInt(id), BigInt(id33), BigInt(commitment));
  const receipt = await tx.wait();

  return {
    id: id.toString(),
    id33: id33.toString(),
    receiptHash: receipt?.hash || null,
    transactionHash: tx.hash
  };
}

async function getMasterIdentityRegistration(masterIdentity) {
  const { contract } = toRegistryContract();
  const [id, id33] = masterIdentity.publicKey;
  const index = await contract.getIDIndex(BigInt(id), BigInt(id33));

  if (index < 0) {
    return {
      active: false,
      index: -1,
      id: id.toString(),
      id33: id33.toString()
    };
  }

  const identity = await contract.getIdentity(index);
  return {
    active: Boolean(identity.active),
    index: Number(index),
    id: identity.id.toString(),
    id33: identity.id33.toString(),
    owner: identity.recordOwner,
    registeredAt: Number(identity.registeredAt)
  };
}

async function getActiveIdentities() {
  const { contract } = toRegistryContract();
  const size = await contract.getIDSize();
  const identities = [];

  for (let index = 0n; index < size; index += 1n) {
    const identity = await contract.getIdentity(index);
    if (!identity.active) {
      continue;
    }

    identities.push({
      commitment: identity.commitment.toString(),
      id: identity.id.toString(),
      id33: identity.id33.toString(),
      index: Number(index),
      owner: identity.recordOwner,
      registeredAt: Number(identity.registeredAt)
    });
  }

  return identities;
}

module.exports = {
  getActiveIdentities,
  getMasterIdentityRegistration,
  getRegistryConfig,
  registerMasterIdentity
};

module.exports.default = module.exports;
