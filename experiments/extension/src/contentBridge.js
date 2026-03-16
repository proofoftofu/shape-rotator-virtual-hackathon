import { installBufferPolyfill } from "./installBufferPolyfill.js";
import { createWindowMessageBridge } from "./messageBridge.js";

installBufferPolyfill();

console.log("[u2sso-extension] content bridge injected");

const bridge = createWindowMessageBridge();

bridge.start();
