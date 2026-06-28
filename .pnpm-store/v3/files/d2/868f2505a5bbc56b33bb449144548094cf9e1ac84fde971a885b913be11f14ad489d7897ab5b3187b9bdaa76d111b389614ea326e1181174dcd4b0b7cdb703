// src/builder-code/types.ts
var BUILDER_CODE = "builder-code";
var ERC_8021_MARKER = "80218021802180218021802180218021";
var SCHEMA_2_ID = 2;
var BUILDER_CODE_PATTERN = /^[a-z0-9_]{1,32}$/;

// src/builder-code/cbor.ts
function normalizeServiceCodes(s) {
  if (typeof s === "string") return [s];
  if (Array.isArray(s)) return s;
  return [];
}
function encodeCborMap(data) {
  const entries = [];
  let mapSize = 0;
  if (data.a) {
    mapSize++;
    entries.push(encodeCborString("a"));
    entries.push(encodeCborString(data.a));
  }
  if (data.w) {
    mapSize++;
    entries.push(encodeCborString("w"));
    entries.push(encodeCborString(data.w));
  }
  const serviceCodes = normalizeServiceCodes(data.s);
  if (serviceCodes.length > 0) {
    mapSize++;
    entries.push(encodeCborString("s"));
    entries.push(encodeCborArray(serviceCodes));
  }
  const header = encodeCborMajorType(5, mapSize);
  const totalLength = header.length + entries.reduce((sum, e) => sum + e.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  result.set(header, offset);
  offset += header.length;
  for (const entry of entries) {
    result.set(entry, offset);
    offset += entry.length;
  }
  return result;
}
function encodeCborString(value) {
  const encoded = new TextEncoder().encode(value);
  const header = encodeCborMajorType(3, encoded.length);
  const result = new Uint8Array(header.length + encoded.length);
  result.set(header, 0);
  result.set(encoded, header.length);
  return result;
}
function encodeCborArray(values) {
  const header = encodeCborMajorType(4, values.length);
  const encodedValues = values.map(encodeCborString);
  const totalLength = header.length + encodedValues.reduce((sum, e) => sum + e.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  result.set(header, offset);
  offset += header.length;
  for (const encoded of encodedValues) {
    result.set(encoded, offset);
    offset += encoded.length;
  }
  return result;
}
function encodeCborMajorType(majorType, value) {
  const mt = majorType << 5;
  if (value <= 23) {
    return new Uint8Array([mt | value]);
  }
  if (value <= 255) {
    return new Uint8Array([mt | 24, value]);
  }
  if (value <= 65535) {
    return new Uint8Array([mt | 25, value >> 8 & 255, value & 255]);
  }
  throw new Error(`CBOR value too large: ${value}`);
}
function encodeBuilderCodeSuffix(data) {
  const cborBytes = encodeCborMap(data);
  const cborLength = cborBytes.length;
  const lengthHigh = cborLength >> 8 & 255;
  const lengthLow = cborLength & 255;
  const suffixBytes = new Uint8Array(cborLength + 2 + 1 + 16);
  let offset = 0;
  suffixBytes.set(cborBytes, offset);
  offset += cborLength;
  suffixBytes[offset++] = lengthHigh;
  suffixBytes[offset++] = lengthLow;
  suffixBytes[offset++] = SCHEMA_2_ID;
  const markerBytes = hexToBytes(ERC_8021_MARKER);
  suffixBytes.set(markerBytes, offset);
  return `0x${bytesToHex(suffixBytes)}`;
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function parseBuilderCodeSuffixFromCalldata(calldata) {
  const hex = calldata.startsWith("0x") ? calldata.slice(2) : calldata;
  const markerPos = hex.lastIndexOf(ERC_8021_MARKER.toLowerCase());
  if (markerPos < 6) {
    return void 0;
  }
  if (parseInt(hex.slice(markerPos - 2, markerPos), 16) !== SCHEMA_2_ID) {
    return void 0;
  }
  const cborLength = parseInt(hex.slice(markerPos - 6, markerPos - 2), 16);
  const suffixStart = markerPos - 6 - cborLength * 2;
  if (suffixStart < 0 || suffixStart + (cborLength + 19) * 2 !== hex.length) {
    return void 0;
  }
  const bytes = hexToBytes(hex.slice(suffixStart, markerPos - 6));
  let o = 0;
  if (bytes[o] >> 5 !== 5) {
    return void 0;
  }
  const mapInfo = bytes[o++] & 31;
  const mapSize = mapInfo <= 23 ? mapInfo : mapInfo === 24 ? bytes[o++] : void 0;
  if (mapSize === void 0) {
    return void 0;
  }
  const result = {};
  for (let entry = 0; entry < mapSize; entry++) {
    if (bytes[o] >> 5 !== 3) {
      return void 0;
    }
    const keyInfo = bytes[o++] & 31;
    const keyLen = keyInfo <= 23 ? keyInfo : keyInfo === 24 ? bytes[o++] : void 0;
    if (keyLen === void 0) {
      return void 0;
    }
    const key = new TextDecoder().decode(bytes.subarray(o, o + keyLen));
    o += keyLen;
    if (key === "a" || key === "w") {
      if (bytes[o] >> 5 !== 3) {
        return void 0;
      }
      const valueInfo = bytes[o++] & 31;
      const valueLen = valueInfo <= 23 ? valueInfo : valueInfo === 24 ? bytes[o++] : void 0;
      if (valueLen === void 0) {
        return void 0;
      }
      result[key] = new TextDecoder().decode(bytes.subarray(o, o + valueLen));
      o += valueLen;
      continue;
    }
    if (key === "s") {
      if (bytes[o] >> 5 !== 4) {
        return void 0;
      }
      const arrayInfo = bytes[o++] & 31;
      const arraySize = arrayInfo <= 23 ? arrayInfo : arrayInfo === 24 ? bytes[o++] : void 0;
      if (arraySize === void 0) {
        return void 0;
      }
      const codes = [];
      for (let i = 0; i < arraySize; i++) {
        if (bytes[o] >> 5 !== 3) {
          return void 0;
        }
        const itemInfo = bytes[o++] & 31;
        const itemLen = itemInfo <= 23 ? itemInfo : itemInfo === 24 ? bytes[o++] : void 0;
        if (itemLen === void 0) {
          return void 0;
        }
        codes.push(new TextDecoder().decode(bytes.subarray(o, o + itemLen)));
        o += itemLen;
      }
      if (codes.length > 0) {
        result.s = codes;
      }
      continue;
    }
    return void 0;
  }
  return result;
}

// src/builder-code/server.ts
var BUILDER_CODE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    a: {
      type: "string",
      pattern: "^[a-z0-9_]{1,32}$",
      description: "App builder code"
    },
    w: {
      type: "string",
      pattern: "^[a-z0-9_]{1,32}$",
      description: "Wallet builder code"
    },
    s: {
      type: "array",
      items: {
        type: "string",
        pattern: "^[a-z0-9_]{1,32}$"
      },
      description: "Service builder codes"
    }
  },
  additionalProperties: false
};
function declareBuilderCodeExtension(appCode) {
  if (!BUILDER_CODE_PATTERN.test(appCode)) {
    throw new Error(
      `Invalid builder code: "${appCode}". Must be 1-32 characters, lowercase alphanumeric and underscores only.`
    );
  }
  return {
    info: { a: appCode },
    schema: BUILDER_CODE_SCHEMA
  };
}
var builderCodeResourceServerExtension = {
  key: BUILDER_CODE
};

// src/builder-code/client.ts
var BuilderCodeClientExtension = class {
  /**
   * Creates a client extension that attaches the given service code(s) to payments.
   *
   * Accepts a single code or an array of codes so layered clients (e.g. an MCP
   * middleware) can attribute multiple participants. Codes are normalized to an
   * array and sent as the `s` field.
   *
   * @param serviceCodes - Client service code(s) (`s`), each 1-32 lowercase alphanumeric/underscore characters
   */
  constructor(serviceCodes) {
    this.key = BUILDER_CODE;
    const codes = Array.isArray(serviceCodes) ? serviceCodes : [serviceCodes];
    for (const code of codes) {
      if (!BUILDER_CODE_PATTERN.test(code)) {
        throw new Error(
          `Invalid builder code: "${code}". Must be 1-32 characters, lowercase alphanumeric and underscores only.`
        );
      }
    }
    this.serviceCodes = codes;
  }
  /**
   * Attaches this client's service code(s) (`s`).
   *
   * @param payload - Payment payload to enrich
   * @param _ - Server payment requirements; core merges server extension data
   * @returns Payment payload with builder-code extension data
   */
  async enrichPaymentPayload(payload, _) {
    return {
      ...payload,
      extensions: {
        ...payload.extensions,
        [BUILDER_CODE]: { info: { s: this.serviceCodes } }
      }
    };
  }
};

// src/builder-code/facilitator.ts
function extractClientExtension(extensions) {
  const info = extensions?.[BUILDER_CODE]?.info;
  if (typeof info !== "object" || info === null || Array.isArray(info)) return void 0;
  return info;
}
function resolveServiceCodes(raw) {
  const candidates = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  return candidates.filter(
    (v) => typeof v === "string" && BUILDER_CODE_PATTERN.test(v)
  );
}
var BuilderCodeFacilitatorExtension = class {
  /**
   * Creates a facilitator extension that encodes builder-code attribution at settlement.
   *
   * @param config - Optional facilitator builder-code configuration (wallet code `w`)
   */
  constructor(config = {}) {
    this.key = BUILDER_CODE;
    if (config.builderCode && !BUILDER_CODE_PATTERN.test(config.builderCode)) {
      throw new Error(
        `Invalid builder code: "${config.builderCode}". Must be 1-32 characters, lowercase alphanumeric and underscores only.`
      );
    }
    this.config = config;
  }
  /**
   * Builds the ERC-8021 Schema 2 calldata suffix for a settlement transaction.
   *
   * - `a` and `s` are read from the client's payment payload extensions.
   * - `w` is the facilitator's own code when configured.
   *
   * @param ctx - Settlement context with payment-payload extensions
   * @returns Hex-encoded ERC-8021 builder-code calldata suffix, or undefined when no attribution is present
   */
  buildDataSuffix(ctx) {
    const clientExt = extractClientExtension(ctx.paymentPayload.extensions);
    const a = typeof clientExt?.a === "string" && BUILDER_CODE_PATTERN.test(clientExt.a) ? clientExt.a : void 0;
    const s = resolveServiceCodes(clientExt?.s);
    const data = {
      ...this.config.builderCode && { w: this.config.builderCode },
      ...a && { a },
      ...s.length > 0 && { s }
    };
    if (!data.a && !data.w && (!data.s || Array.isArray(data.s) && data.s.length === 0)) {
      return void 0;
    }
    return encodeBuilderCodeSuffix(data);
  }
};

export {
  BUILDER_CODE,
  ERC_8021_MARKER,
  SCHEMA_2_ID,
  BUILDER_CODE_PATTERN,
  encodeBuilderCodeSuffix,
  parseBuilderCodeSuffixFromCalldata,
  BUILDER_CODE_SCHEMA,
  declareBuilderCodeExtension,
  builderCodeResourceServerExtension,
  BuilderCodeClientExtension,
  BuilderCodeFacilitatorExtension
};
//# sourceMappingURL=chunk-26YBCURG.mjs.map