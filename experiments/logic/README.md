# Logic Experiment

This experiment reworks `workspace/experiments/logic` to follow the forked U2SSO sample as closely as possible in plain Node.js without introducing placeholder proof data.

## What Was Ported

Primary references:

- `forks/U2SSO/proof-of-concept/clientapp.go`
- `forks/U2SSO/proof-of-concept/u2sso/u2ssolib.go`

Supporting JS reference:

- `forks/U2SSO/crypto-snark/src/index.js`

Ported flow in this experiment:

- passkey creation and loading as a raw 32-byte file
- master identity derivation from that secret
- service-specific child secret derivation using the fork JS Poseidon-based child-key logic
- service public key creation using the fork JS `createSPK` behavior
- registration payload generation using the fork JS Semaphore membership proof flow
- login payload generation using the fork JS service-key signature flow

## Files

- `src/forkReference.js`: direct local port of the useful fork JS primitives
- `src/index.js`: experiment API with passkey I/O, group setup, registration payload, and login payload
- `cli.js`: runnable entry script
- `test/logic.test.js`: tests for passkey handling and proof-flow parity against the local fork reference port

## Run

```bash
npm install
npm test
npm start
```

You can override runtime inputs:

```bash
node cli.js --passkey-path=./fixtures/master-secret.bin --service-name=example.com --registration-challenge=register-1 --login-challenge=login-1
```

## Result

The current implementation uses real proof/signature logic from the forked JavaScript path. It does not use mock hashes, HMAC placeholders, or proof-shaped stand-ins.

## What Still Differs From The Fork

- The original Go sample uses the native `secp256k1_ringcip` and Boquila C functions from `u2ssolib.go` for master identity derivation, service key derivation, registration proofs, and auth proofs.
- This experiment cannot execute that exact Go/C path in Node.js because the original dependency chain is native and not exposed as a JavaScript library in the repo.
- Instead, this experiment uses the fork’s existing JavaScript cryptographic path from `forks/U2SSO/crypto-snark/src/index.js`, which is based on Semaphore identities, Poseidon child-key derivation, and Semaphore membership proofs.
- The group for registration is created locally from deterministic fixture identities rather than being loaded from the on-chain contract used by `clientapp.go`.

## Equivalence Status

- Relative to the forked JavaScript path in `forks/U2SSO/crypto-snark/src/index.js`: functionally equivalent for the implemented create-ID, child-credential, registration-proof, and login-proof flow.
- Relative to the Go/C fork in `proof-of-concept/u2sso/u2ssolib.go`: only partially equivalent.

## Remaining Blockers

- The main blocker is the original C/Go dependency chain around `secp256k1_ringcip` and Boquila, which is not directly available as a JavaScript-callable library in this workspace.
- The environment used for this experiment also does not expose a working `go` toolchain, which prevents validating the Node flow against the exact Go implementation in automated tests.
