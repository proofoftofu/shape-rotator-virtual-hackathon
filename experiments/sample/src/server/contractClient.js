"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const contractsPackagePath = path.resolve(process.cwd(), "..", "..", "contracts", "package.json");
const contractsRequire = createRequire(contractsPackagePath);
const { Contract, JsonRpcProvider, Wallet } = contractsRequire("ethers");

const DEFAULT_DEPLOYMENT = path.resolve(
  process.cwd(),
  "..",
  "..",
  "contracts",
  "deployments",
  "hardhat.json"
);

function readDeploymentFile(deploymentPath = DEFAULT_DEPLOYMENT) {
  const raw = fs.readFileSync(deploymentPath, "utf8");
  return JSON.parse(raw);
}

function getRegistryConfig() {
  const source = process.env.U2SSO_SAMPLE_REGISTRY_SOURCE || "local";
  const rpcUrl =
    process.env.U2SSO_SAMPLE_RPC_URL ||
    process.env.U2SSO_SAMPLE_PRC_URL ||
    process.env.U2SSO_PRC ||
    process.env.PRC;
  const privateKey =
    process.env.U2SSO_SAMPLE_PRIVATE_KEY ||
    process.env.U2SSO_PRIVATE_KEY ||
    process.env.PRIVATE_KEY;
  const deploymentPath = process.env.U2SSO_SAMPLE_REGISTRY_DEPLOYMENT || DEFAULT_DEPLOYMENT;
  const address = process.env.U2SSO_SAMPLE_REGISTRY_ADDRESS || process.env.U2SSO_ADDRESS;

  if (!rpcUrl) {
    throw new Error("Missing RPC URL env var: U2SSO_SAMPLE_RPC_URL");
  }

  if (!privateKey) {
    throw new Error("Missing signer env var: U2SSO_SAMPLE_PRIVATE_KEY");
  }

  const deployment = fs.existsSync(deploymentPath) ? readDeploymentFile(deploymentPath) : null;
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
  const deployment = fs.existsSync(config.deploymentPath) ? readDeploymentFile(config.deploymentPath) : null;
  const provider = new JsonRpcProvider(config.rpcUrl);
  const wallet = new Wallet(config.privateKey, provider);
  const abi = deployment?.abi || require(path.resolve(__dirname, "../../../contracts/artifacts/contracts/U2SSORegistry.sol/U2SSORegistry.json")).abi;
  const contract = new Contract(config.address, abi, wallet);

  return { contract, provider, wallet };
}

async function registerMasterIdentity(masterIdentity) {
  const { contract } = toRegistryContract();
  const [id, id33] = masterIdentity.publicKey;

  const tx = await contract.addID(BigInt(id), BigInt(id33));
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
  const [ids, id33s] = await contract.getActiveIDs();

  return ids.map((id, index) => ({
    id: id.toString(),
    id33: id33s[index].toString()
  }));
}

module.exports = {
  getActiveIdentities,
  getMasterIdentityRegistration,
  getRegistryConfig,
  registerMasterIdentity
};

module.exports.default = module.exports;
