import { createWindowMessageBridge } from "./messageBridge.js";

const bridge = createWindowMessageBridge();

bridge.start();
