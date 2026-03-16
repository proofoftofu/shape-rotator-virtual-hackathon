import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const logicRoot = path.resolve(root, "../logic");
const logicArtifactsRoot = path.resolve(logicRoot, "artifacts");
const distRoot = path.resolve(root, "dist");
const bufferBanner = `
if(typeof globalThis.Buffer==="undefined"){
  globalThis.Buffer={
    from(value, encoding){
      let bytes;
      if(value instanceof Uint8Array){
        bytes=value;
      }else if(value instanceof ArrayBuffer){
        bytes=new Uint8Array(value);
      }else if(ArrayBuffer.isView(value)){
        bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
      }else if(typeof value==="string"){
        if(encoding==="hex"){
          const normalized=value.trim();
          if(normalized.length%2!==0) throw new Error("Expected an even-length hex string");
          const pairs=normalized.match(/.{1,2}/g)||[];
          bytes=Uint8Array.from(pairs.map((entry)=>Number.parseInt(entry,16)));
        }else{
          bytes=new TextEncoder().encode(value);
        }
      }else if(Array.isArray(value)){
        bytes=Uint8Array.from(value);
      }else{
        throw new Error("Unsupported Buffer input");
      }
      return {
        data: bytes,
        toString(format="utf8"){
          if(format==="hex"){
            return Array.from(bytes,(entry)=>entry.toString(16).padStart(2,"0")).join("");
          }
          return new TextDecoder().decode(bytes);
        },
        valueOf(){
          return bytes;
        }
      };
    }
  };
}
`;

function copyLogicArtifacts() {
  const targetRoot = path.resolve(distRoot, "artifacts");
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

await build({
  configFile: false,
  plugins: [react()],
  publicDir: path.resolve(root, "public"),
  root,
  server: {
    fs: {
      allow: [path.resolve(root, "..")]
    }
  },
  build: {
    outDir: distRoot,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(root, "index.html")
      },
      output: {
        banner: bufferBanner,
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});

await build({
  configFile: false,
  publicDir: false,
  root,
  server: {
    fs: {
      allow: [path.resolve(root, "..")]
    }
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: path.resolve(root, "src", "contentBridge.js"),
      formats: ["iife"],
      name: "U2SSOContentBridge",
      fileName: () => "assets/contentBridge.js"
    },
    outDir: distRoot,
    rollupOptions: {
      output: {
        banner: bufferBanner,
        extend: true,
        inlineDynamicImports: true
      }
    }
  }
});

copyLogicArtifacts();
