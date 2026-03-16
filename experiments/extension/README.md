# Extension Experiment

This experiment tests whether the U2SSO JavaScript proof flow from `workspace/experiments/logic` can run inside a Chrome extension popup built with React and Tailwind.

## What Was Implemented

- A minimal Manifest V3 Chrome extension popup using React.
- Tailwind styling for the popup UI.
- A shared browser-safe proof module in `workspace/experiments/logic/src/browserCore.js`.
- An extension controller that stores one master secret in `chrome.storage.local`, derives service-scoped credentials, and generates registration and login payloads.
- A content-script browser bridge that listens for sample-app `window.postMessage` requests and responds with the corresponding proof payload.
- Tests that compare the extension flow against the existing `logic` experiment outputs.

## Files

- `src/experimentController.js`: browser-side storage and flow controller for the popup
- `src/messageBridge.js`: window-message contract handler for the sample app bridge
- `src/contentBridge.js`: content-script entry that mounts the browser bridge
- `src/App.jsx`: popup UI for identity creation and payload generation
- `src/index.css`: Tailwind entry and popup base styles
- `public/manifest.json`: Chrome extension manifest
- `vite.config.js`: Vite config and build-time artifact copy from `../logic/artifacts`
- `test/extension-flow.test.mjs`: parity tests against `workspace/experiments/logic`
- `test/message-bridge.test.mjs`: sample-app browser bridge contract tests

## Run

```bash
npm install
npm test
npm run build
```

Load the unpacked extension from `workspace/experiments/extension/dist` in Chrome after the build finishes.

For popup development:

```bash
npm run dev
```

## Result

The experiment reuses the logic implementation by importing the shared browser-safe proof flow from `workspace/experiments/logic/src/browserCore.js`. The popup can:

- create or load one stored master secret
- accept a service name and challenges
- derive the service child credential
- generate the registration payload
- generate the login payload
- display outputs directly in the popup

The content script now also responds to the sample app bridge contract:

- request:
  - `source: "u2sso-sample"`
  - `type: "u2sso:request"`
  - `flow: "signup" | "login"`
  - `challenge`
  - `serviceName`
- response:
  - `source: "u2sso-extension"`
  - `flow`
  - `payload`

When the bridge receives a valid request:

- `flow === "signup"` returns `registrationPayload`
- `flow === "login"` returns `loginPayload`

The bridge does not replace the proof flow. It calls the existing `runExtensionExperiment` controller, which reuses the logic imported from `workspace/experiments/logic`.

The tests assert parity between the extension controller output and the existing `logic` experiment for the same master secret, service name, and challenges, and they also cover the browser message bridge contract.

## Current Limitations

- The sample-app integration currently uses a content-script `window.postMessage` bridge, not a background-script or long-lived port.
- The manifest currently matches `<all_urls>` so the bridge can be exercised easily during local experiment work. Tightening the match list should happen before any non-experiment release.
- Registration proof generation still depends on the Semaphore `.wasm` and `.zkey` artifacts copied from `workspace/experiments/logic/artifacts` at build time.
- I have not verified a real Chrome-to-sample-app browser session in this repo run; the current validation is automated parity tests, browser-bridge tests, and a successful build.
