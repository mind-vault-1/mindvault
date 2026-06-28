// src/shared/base64.ts
function safeBase64Decode(str) {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(str, "base64").toString("utf-8");
    }
    return atob(str);
  } catch {
    throw new Error("Invalid base64 string");
  }
}
function safeBase64Encode(str) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf-8").toString("base64");
  }
  return btoa(str);
}
function encodePaymentHeader(payload) {
  return safeBase64Encode(JSON.stringify(payload));
}
function decodePaymentHeader(header) {
  const decoded = safeBase64Decode(header);
  return JSON.parse(decoded);
}

// src/shared/json.ts
function toJsonSafe(obj) {
  return JSON.parse(
    JSON.stringify(
      obj,
      (_key, value) => typeof value === "bigint" ? value.toString() : value
    )
  );
}

export { decodePaymentHeader, encodePaymentHeader, safeBase64Decode, safeBase64Encode, toJsonSafe };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map