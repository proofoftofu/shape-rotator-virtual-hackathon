import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const logicRoot = path.resolve(__dirname, "../logic");
const logicArtifactsRoot = path.resolve(logicRoot, "artifacts");

function copyLogicArtifacts() {
  return {
    name: "copy-logic-artifacts",
    closeBundle() {
      const targetRoot = path.resolve(__dirname, "dist", "artifacts");
      fs.mkdirSync(targetRoot, { recursive: true });
      fs.copyFileSync(
        path.resolve(logicArtifactsRoot, "semaphore-2.wasm"),
        path.resolve(targetRoot, "semaphore-2.wasm")
      );
      fs.copyFileSync(
        path.resolve(logicArtifactsRoot, "semaphore-2.zkey"),
        path.resolve(targetRoot, "semaphore-2.zkey")
      );
    }
  };
}

export default defineConfig({
  plugins: [react(), copyLogicArtifacts()],
  publicDir: "public",
  server: {
    fs: {
      allow: [path.resolve(__dirname, "..")]
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, "index.html"),
        contentBridge: path.resolve(__dirname, "src", "contentBridge.js")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
