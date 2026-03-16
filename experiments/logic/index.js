"use strict";

const {
  DEFAULT_LOGIN_CHALLENGE,
  DEFAULT_MASTER_SECRET_SEED,
  DEFAULT_REGISTRATION_CHALLENGE,
  DEFAULT_SERVICE_NAME,
  runLogicExperiment
} = require("./src/logic");

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const result = runLogicExperiment({
  masterSecretSeed: readArg("master-secret-seed", DEFAULT_MASTER_SECRET_SEED),
  serviceName: readArg("service-name", DEFAULT_SERVICE_NAME),
  registrationChallenge: readArg("registration-challenge", DEFAULT_REGISTRATION_CHALLENGE),
  loginChallenge: readArg("login-challenge", DEFAULT_LOGIN_CHALLENGE)
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
