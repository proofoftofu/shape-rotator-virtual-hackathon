# Sample Experiment

This experiment adds a minimal Next.js sample service in `workspace/experiments/sample` and reuses the existing logic from `workspace/experiments/logic` for server-side verification.

## What Was Implemented

- A Next.js app with `app/` routes for `/signup` and `/login`.
- API routes for challenge issuance, signup verification, login verification, and demo payload generation.
- A shared in-memory demo service that:
  - issues per-flow challenges
  - verifies registration proofs against a server-owned registry group
  - enforces one nullifier per service
  - verifies login signatures against the stored service public key
  - creates an in-memory session token after successful login
- A browser `window.postMessage` contract for the future extension integration:
  - request: `source = "u2sso-sample"`, `type = "u2sso:request"`, `flow`, `challenge`, `serviceName`
  - response: `source = "u2sso-extension"`, `flow`, `payload`
- Extension-first payload request handling in the UI, with automatic fallback to demo payload generation when the extension is unavailable.
- Automated tests that execute signup and login using real payloads from the logic experiment and cover extension/fallback request selection.

## Files

- `app/`: Next.js pages and API routes
- `src/server/demoService.js`: challenge issuance, verification, account binding, session issuance
- `src/server/demoStore.js`: in-memory store for demo state
- `src/client/extensionBridge.js`: browser message contract for extension requests
- `test/sample.test.js`: integration-style tests for signup and login verification

## Run

Install the sample app dependencies, then run the tests and the dev server:

```bash
npm install
npm test
npm run dev
```

Open:

- `http://localhost:3000/signup`
- `http://localhost:3000/login`

The default request flow now tries the real extension bridge first. If the extension does not respond, the UI falls back automatically to demo payload generation using `workspace/experiments/logic`. The manual demo button remains available when you want to force the fallback path directly.

## Current Extension Status

- The browser-side contract expected by the sample app is already in place.
- The separate extension experiment is not implemented in this workspace yet, so end-to-end browser integration is still pending that experiment.
- Once the extension is available, the sample app is ready to request signup/login payloads over `window.postMessage` without changing the server-side verification path.

## Test Instructions

Run:

```bash
npm test
```

This now exits cleanly after the tests finish. The suite:

- verifies signup proof acceptance with the shared logic experiment
- verifies login signature acceptance with the shared logic experiment
- verifies duplicate-nullifier rejection
- verifies tampered-signature rejection
- verifies extension-first payload selection and fallback behavior

## Result

The sample service experiment confirms that the current JavaScript U2SSO logic can be reused on the server side in a Next.js-oriented structure for:

- signup proof verification against a server-owned registry group
- nullifier-based duplicate prevention per service
- login signature verification against the account bound during signup
- session creation after successful login

## Current Limitations

- The Chrome extension experiment has not been implemented in this workspace yet, so the browser-side integration is extension-ready but still validated through the demo fallback in this repo.
- The demo registry is an in-memory fixture group derived from `DEFAULT_GROUP_SECRETS`, not the on-chain registry from the original Go sample.
- Account and session state are in-memory only and reset on server restart.
- Tests verify the shared service logic and payload-selection behavior directly; they do not boot the full Next.js runtime.
