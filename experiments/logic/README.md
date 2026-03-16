# Logic Experiment

This experiment implements the minimum U2SSO-style registration and login flow as a plain Node.js module and CLI script.

## Implemented

- Deterministic master secret generation from a fixed seed for repeatable local tests.
- Master identity derivation from that master secret.
- Service-specific child credential derivation for a fixed service name.
- Separate registration and login payload generation with stable structured output.
- Local automated tests using Node's built-in test runner.

## Files

- `src/logic.js`: reusable derivation and payload-generation module.
- `index.js`: Node entry script that prints the experiment result as JSON.
- `test/logic.test.js`: tests for output shape, determinism, service separation, and CLI output.

## Run

```bash
npm test
npm start
```

You can also override defaults:

```bash
node index.js --service-name=example.com --registration-challenge=reg-1 --login-challenge=login-1
```

## Output Shape

The script returns:

- `masterSecret`
- `masterIdentity`
- `serviceName`
- `childCredential`
- `registrationPayload`
- `loginPayload`

## Result

The minimum derivation and payload-generation flow works in plain Node.js and is testable locally.

## Differences From The Original Sample

- This experiment does not reproduce the original native `secp256k1_ringcip` membership proof flow from the Go sample.
- This experiment also does not execute the Semaphore/snark proof stack from `forks/U2SSO/crypto-snark`.
- Instead, it uses deterministic hash- and HMAC-based proof-equivalent payloads to validate the Node.js module structure, stable derivation flow, and registration/login payload separation.
- That makes this suitable as a logic experiment for API shape and control flow, but not yet as a cryptographic-equivalence port of the original sample.
