# Extension Experiment

This experiment tests whether the U2SSO JavaScript proof flow from `workspace/experiments/logic` can run inside a Chrome extension popup built with React and Tailwind.

## What Was Implemented

- A minimal Manifest V3 Chrome extension popup using React.
- Tailwind styling for the popup UI.
- A shared browser-safe proof module in `workspace/experiments/logic/src/browserCore.js`.
- An extension controller that stores one master secret in `chrome.storage.local`, derives service-scoped credentials, and generates registration and login payloads.
- Tests that compare the extension flow against the existing `logic` experiment outputs.

## Files

- `src/experimentController.js`: browser-side storage and flow controller for the popup
- `src/App.jsx`: popup UI for identity creation and payload generation
- `src/index.css`: Tailwind entry and popup base styles
- `public/manifest.json`: Chrome extension manifest
- `vite.config.js`: Vite config and build-time artifact copy from `../logic/artifacts`
- `test/extension-flow.test.mjs`: parity tests against `workspace/experiments/logic`

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

The tests assert parity between the extension controller output and the existing `logic` experiment for the same master secret, service name, and challenges.

## Current Limitations

- The extension is popup-only for this experiment. It does not yet expose background messaging to a web app.
- Registration proof generation still depends on the Semaphore `.wasm` and `.zkey` artifacts copied from `workspace/experiments/logic/artifacts` at build time.
- I have not verified a real Chrome load in this repo session; the current validation is code-level plus automated parity tests.
