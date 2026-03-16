"use strict";

const {
  DEFAULT_LOGIN_CHALLENGE,
  DEFAULT_MASTER_SECRET_PATH,
  DEFAULT_REGISTRATION_CHALLENGE,
  DEFAULT_SERVICE_NAME,
  runLogicExperiment,
  toJsonSafe
} = require("./src");

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

async function main() {
  const result = await runLogicExperiment({
    passkeyPath: readArg("passkey-path", DEFAULT_MASTER_SECRET_PATH),
    serviceName: readArg("service-name", DEFAULT_SERVICE_NAME),
    registrationChallenge: readArg("registration-challenge", DEFAULT_REGISTRATION_CHALLENGE),
    loginChallenge: readArg("login-challenge", DEFAULT_LOGIN_CHALLENGE)
  });

  process.stdout.write(`${JSON.stringify(toJsonSafe(result), null, 2)}\n`);
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
