import logicBrowserCore from "../../logic/src/browserCore.mjs";

const {
  DEFAULT_GROUP_SECRETS,
  DEFAULT_LOGIN_CHALLENGE,
  DEFAULT_REGISTRATION_CHALLENGE,
  DEFAULT_SERVICE_NAME,
  buildGroup,
  buildGroupFromRegistryEntries,
  createLoginPayload,
  createRegistrationPayload,
  deriveChildCredential,
  deriveMasterIdentity
} = logicBrowserCore;

const STORAGE_KEY = "u2sso.masterSecretHex";
const CHILD_CREDENTIALS_KEY = "u2sso.childCredentials";
const MASTER_REGISTRATION_STATE_KEY = "u2sso.masterRegistrationState";
const REGISTRY_ORIGIN_KEY = "u2sso.registryOrigin";
const DEMO_EXTENSION_MASTER_SECRET = DEFAULT_GROUP_SECRETS[0];
const DEFAULT_REGISTRY_ORIGIN = "https://shape-rotator-virtual-hackathon.vercel.app";

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const normalized = hex.trim();

  if (normalized.length !== 64) {
    throw new Error("Expected a 32-byte hex string");
  }

  return Uint8Array.from(
    normalized.match(/.{1,2}/g).map((value) => Number.parseInt(value, 16))
  );
}

function masterSecretHexToDecimal(masterSecretHex) {
  return BigInt(`0x${masterSecretHex}`).toString(10);
}

function randomMasterSecretHex() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function createBrowserStorage() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return {
      async get(key) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.get(key, (result) => {
            const lastError = chrome.runtime && chrome.runtime.lastError;

            if (lastError) {
              reject(new Error(lastError.message));
              return;
            }

            resolve(result);
          });
        });
      },
      async set(entries) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.set(entries, () => {
            const lastError = chrome.runtime && chrome.runtime.lastError;

            if (lastError) {
              reject(new Error(lastError.message));
              return;
            }

            resolve();
          });
        });
      },
      async remove(keys) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.remove(keys, () => {
            const lastError = chrome.runtime && chrome.runtime.lastError;

            if (lastError) {
              reject(new Error(lastError.message));
              return;
            }

            resolve();
          });
        });
      }
    };
  }

  const memory = new Map();

  return {
    async get(key) {
      return { [key]: memory.get(key) };
    },
    async set(entries) {
      for (const [entryKey, entryValue] of Object.entries(entries)) {
        memory.set(entryKey, entryValue);
      }
    },
    async remove(keys) {
      for (const entryKey of Array.isArray(keys) ? keys : [keys]) {
        memory.delete(entryKey);
      }
    }
  };
}

export async function getStoredChildCredentials(options = {}) {
  const storage = options.storage || createBrowserStorage();
  const stored = await storage.get(CHILD_CREDENTIALS_KEY);
  const value = stored[CHILD_CREDENTIALS_KEY];

  return Array.isArray(value) ? value : [];
}

export async function saveStoredChildCredential(childCredential, options = {}) {
  const storage = options.storage || createBrowserStorage();
  const current = await getStoredChildCredentials({ storage });
  const nextCredential = {
    commitment: childCredential.spkCommitment,
    publicKey: childCredential.spkPublicKey,
    serviceName: childCredential.serviceName
  };
  const nextEntries = current.filter((entry) => entry.serviceName !== nextCredential.serviceName);
  nextEntries.unshift(nextCredential);
  await storage.set({ [CHILD_CREDENTIALS_KEY]: nextEntries });
  return nextEntries;
}

export async function removeStoredChildCredentials(options = {}) {
  const storage = options.storage || createBrowserStorage();

  if (typeof storage.remove === "function") {
    await storage.remove(CHILD_CREDENTIALS_KEY);
    return;
  }

  await storage.set({ [CHILD_CREDENTIALS_KEY]: undefined });
}

export async function getStoredIdentity(options = {}) {
  const storage = options.storage || createBrowserStorage();
  const stored = await storage.get(STORAGE_KEY);
  const masterSecretHex = stored[STORAGE_KEY];

  if (!masterSecretHex) {
    return null;
  }

  hexToBytes(masterSecretHex);

  const masterSecret = masterSecretHexToDecimal(masterSecretHex);
  const masterIdentity = await deriveMasterIdentity(masterSecret);

  return {
    masterIdentity,
    masterSecret,
    masterSecretHex
  };
}

export async function removeStoredIdentity(options = {}) {
  const storage = options.storage || createBrowserStorage();

  if (typeof storage.remove === "function") {
    await storage.remove(STORAGE_KEY);
    await storage.remove(CHILD_CREDENTIALS_KEY);
    await storage.remove(MASTER_REGISTRATION_STATE_KEY);
    return;
  }

  await storage.set({ [STORAGE_KEY]: undefined });
  await storage.set({ [CHILD_CREDENTIALS_KEY]: undefined });
  await storage.set({ [MASTER_REGISTRATION_STATE_KEY]: undefined });
}

export async function getStoredMasterRegistrationState(options = {}) {
  const storage = options.storage || createBrowserStorage();
  const stored = await storage.get(MASTER_REGISTRATION_STATE_KEY);
  return stored[MASTER_REGISTRATION_STATE_KEY] || null;
}

export async function saveStoredMasterRegistrationState(state, options = {}) {
  const storage = options.storage || createBrowserStorage();
  await storage.set({ [MASTER_REGISTRATION_STATE_KEY]: state });
  return state;
}

export async function getStoredRegistryOrigin(options = {}) {
  const storage = options.storage || createBrowserStorage();
  const stored = await storage.get(REGISTRY_ORIGIN_KEY);
  return stored[REGISTRY_ORIGIN_KEY] || DEFAULT_REGISTRY_ORIGIN;
}

export async function saveStoredRegistryOrigin(origin, options = {}) {
  const storage = options.storage || createBrowserStorage();
  const nextOrigin = typeof origin === "string" && origin.trim() ? origin.trim() : DEFAULT_REGISTRY_ORIGIN;
  await storage.set({ [REGISTRY_ORIGIN_KEY]: nextOrigin });
  return nextOrigin;
}

function resolveSnarkArtifacts(runtimeBaseUrl = "") {
  const baseUrl = runtimeBaseUrl || (typeof chrome !== "undefined" && chrome.runtime
    ? chrome.runtime.getURL("")
    : "");
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return {
    wasm: `${normalizedBaseUrl}artifacts/semaphore-2.wasm`,
    zkey: `${normalizedBaseUrl}artifacts/semaphore-2.zkey`
  };
}

async function fetchArtifactBytes(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch artifact: ${url} (${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (bytes.length < 4) {
    throw new Error(`Artifact too small: ${url}`);
  }

  return bytes;
}

export async function loadSnarkArtifactBytes(runtimeBaseUrl = "") {
  const resolved = resolveSnarkArtifacts(runtimeBaseUrl);

  return {
    wasm: await fetchArtifactBytes(resolved.wasm),
    zkey: await fetchArtifactBytes(resolved.zkey)
  };
}

export async function createOrLoadIdentity(options = {}) {
  const storage = options.storage || createBrowserStorage();
  const storedIdentity = await getStoredIdentity({ storage });
  let masterSecretHex = storedIdentity?.masterSecretHex;
  let created = false;

  if (!masterSecretHex) {
    masterSecretHex = options.masterSecretHex || randomMasterSecretHex();
    await storage.set({ [STORAGE_KEY]: masterSecretHex });
    created = true;
  }

  hexToBytes(masterSecretHex);

  const masterSecret = masterSecretHexToDecimal(masterSecretHex);
  const masterIdentity = await deriveMasterIdentity(masterSecret);

  return {
    created,
    masterSecretHex,
    masterSecret,
    masterIdentity
  };
}

export async function runExtensionExperiment(options = {}) {
  const identity = options.masterSecret
    ? {
        created: false,
        masterSecretHex: options.masterSecretHex || "",
        masterSecret: options.masterSecret,
        masterIdentity: await deriveMasterIdentity(options.masterSecret)
      }
    : await createOrLoadIdentity(options);
  const serviceName = options.serviceName || DEFAULT_SERVICE_NAME;
  const registrationChallenge = options.registrationChallenge || DEFAULT_REGISTRATION_CHALLENGE;
  const loginChallenge = options.loginChallenge || DEFAULT_LOGIN_CHALLENGE;
  const snarkArtifacts = options.snarkArtifacts || resolveSnarkArtifacts(options.runtimeBaseUrl);
  const groupContext = options.registryEntries
    ? await buildGroupFromRegistryEntries(identity.masterIdentity, options.registryEntries)
    : await buildGroup(identity.masterSecret, options.groupSecrets || DEFAULT_GROUP_SECRETS);
  const childCredential = await deriveChildCredential(identity.masterSecret, serviceName);
  const registrationPayload = await createRegistrationPayload(
    identity.masterSecret,
    serviceName,
    registrationChallenge,
    groupContext,
    { snarkArtifacts }
  );
  const loginPayload = await createLoginPayload(identity.masterSecret, serviceName, loginChallenge);

  return {
    ...identity,
    serviceName,
    childCredential,
    registrationPayload,
    loginPayload
  };
}

export async function previewChildCredential(masterSecret, serviceName) {
  return deriveChildCredential(masterSecret, serviceName);
}

export {
  DEMO_EXTENSION_MASTER_SECRET,
  DEFAULT_GROUP_SECRETS,
  DEFAULT_LOGIN_CHALLENGE,
  DEFAULT_REGISTRATION_CHALLENGE,
  DEFAULT_SERVICE_NAME,
  CHILD_CREDENTIALS_KEY,
  MASTER_REGISTRATION_STATE_KEY,
  REGISTRY_ORIGIN_KEY,
  STORAGE_KEY,
  DEFAULT_REGISTRY_ORIGIN,
  createBrowserStorage,
  hexToBytes,
  masterSecretHexToDecimal,
  randomMasterSecretHex,
  resolveSnarkArtifacts
};
