"use strict";

const {
  createRegistryGroup,
  terminateProofWorkers,
  verifyLoginPayload,
  verifyRegistrationPayload
} = require("../../../logic/src");

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const raw = await readStdin();
  const input = JSON.parse(raw);

  if (input.kind === "registration") {
    const groupContext = await createRegistryGroup(input.groupSecrets);
    const ok = await verifyRegistrationPayload(input.payload, {
      challenge: input.challenge,
      groupContext,
      serviceName: input.serviceName
    });

    process.stdout.write(JSON.stringify({ ok }));
    await terminateProofWorkers();
    process.exit(0);
    return;
  }

  if (input.kind === "login") {
    const ok = await verifyLoginPayload(input.payload, {
      challenge: input.challenge,
      expectedSpkCommitment: input.expectedSpkCommitment,
      expectedSpkPublicKey: input.expectedSpkPublicKey
    });

    process.stdout.write(JSON.stringify({ ok }));
    await terminateProofWorkers();
    process.exit(0);
    return;
  }

  throw new Error(`Unsupported verifier kind: ${input.kind}`);
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
