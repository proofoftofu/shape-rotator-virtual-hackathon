function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const normalized = hex.trim();

  if (normalized.length % 2 !== 0) {
    throw new Error("Expected an even-length hex string");
  }

  return Uint8Array.from(
    normalized.match(/.{1,2}/g)?.map((value) => Number.parseInt(value, 16)) || []
  );
}

function normalizeInput(value, encoding) {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (typeof value === "string") {
    if (encoding === "hex") {
      return hexToBytes(value);
    }

    return new TextEncoder().encode(value);
  }

  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }

  throw new Error("Unsupported Buffer input");
}

export function installBufferPolyfill() {
  if (typeof globalThis.Buffer !== "undefined") {
    return;
  }

  globalThis.Buffer = {
    from(value, encoding) {
      const bytes = normalizeInput(value, encoding);

      return {
        data: bytes,
        toString(format = "utf8") {
          if (format === "hex") {
            return bytesToHex(bytes);
          }

          return new TextDecoder().decode(bytes);
        },
        valueOf() {
          return bytes;
        }
      };
    }
  };
}
