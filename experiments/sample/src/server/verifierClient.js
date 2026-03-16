"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const workerPath = path.resolve(__dirname, "verifierWorker.js");
const WORKER_TIMEOUT_MS = 1000;

function runWorker(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill();
      reject(new Error(`Verifier timed out after ${WORKER_TIMEOUT_MS}ms`));
    }, WORKER_TIMEOUT_MS);

    function finishWithError(message) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(new Error(message));
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;

      try {
        const parsed = JSON.parse(stdout);

        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(parsed);
          child.kill();
        }
      } catch (error) {
        // Wait for a complete JSON payload.
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      finishWithError(error.message);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      if (stdout) {
        try {
          settled = true;
          clearTimeout(timeout);
          resolve(JSON.parse(stdout));
          return;
        } catch (error) {
          finishWithError(error.message);
          return;
        }
      }

      finishWithError(stderr || `Verifier exited with code ${code}`);
    });

    child.stdin.end(JSON.stringify(input));
  });
}

async function verifyRegistrationInWorker({
  challenge,
  groupSecrets,
  payload,
  serviceName
}) {
  return runWorker({
    challenge,
    groupSecrets,
    kind: "registration",
    payload,
    serviceName
  });
}

async function verifyLoginInWorker({
  challenge,
  expectedSpkCommitment,
  expectedSpkPublicKey,
  payload
}) {
  return runWorker({
    challenge,
    expectedSpkCommitment,
    expectedSpkPublicKey,
    kind: "login",
    payload
  });
}

module.exports = {
  verifyLoginInWorker,
  verifyRegistrationInWorker
};
