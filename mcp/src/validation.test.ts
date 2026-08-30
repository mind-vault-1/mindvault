/**
 * Tests for the MCP tool argument validation layer.
 *
 * Coverage has three parts:
 *   1. structural — the spec table and the advertised tool metadata agree
 *   2. per-tool   — every public tool rejects its own bad input
 *   3. semantics  — each argument kind (string/enum/flag/hash) and every issue
 *                   code behaves deterministically
 */
import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS } from "./tools.js";
import {
  TOOL_ARGUMENT_SPECS,
  TOOLS_WITHOUT_ARG_VALIDATION,
  ToolValidationError,
  UnknownToolError,
  flag,
  knownToolNames,
  optionalString,
  requiredString,
  validateToolArgs,
} from "./validation.js";

const VALID_SHA256 = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

/**
 * Advertised tools that go through this layer.
 *
 * `mindvault_publish_status` and `mindvault_purchase_history` normalize their
 * own arguments (see TOOLS_WITHOUT_ARG_VALIDATION) and so have no spec to
 * compare against. The exemption itself is checked below.
 */
function specValidatedTools() {
  const exempt = new Set(TOOLS_WITHOUT_ARG_VALIDATION);
  return TOOL_DEFINITIONS.filter((tool) => !exempt.has(tool.name));
}

/** Minimum arguments that must pass for each tool. */
const VALID_CALLS: Record<string, Record<string, unknown>> = {
  mindvault_setup_wallet: {},
  mindvault_wallet_info: {},
  mindvault_use_profile: { name: "publisher" },
  mindvault_list_profiles: {},
  mindvault_browse: {},
  mindvault_search: { query: "stellar" },
  mindvault_preview: { resourceId: "res-001" },
  mindvault_register: { name: "Agent A", email: "agent@example.com" },
  mindvault_publish: {
    title: "Dataset",
    price: "5.00",
    externalUrl: "https://example.com/data.json",
  },
  mindvault_buy: { resourceId: "res-001" },
  mindvault_export_receipts: {},
  mindvault_register_onchain: { resourceId: "res-001" },
  mindvault_agent_status: {},
  mindvault_registry_info: {},
  mindvault_network_profile: {},
  mindvault_check_bindings: {},
  mindvault_check_consistency: { resourceId: "res-001" },
  mindvault_registry_lookup: { resourceId: "res-001" },
  mindvault_registry_list: {},
  mindvault_tx_status: { txHash: VALID_SHA256 },
  mindvault_reset: {},
  mindvault_backup_state: { passphrase: "correct-horse" },
  mindvault_restore_state: { blob: "v1:abc", passphrase: "correct-horse" },
  mindvault_metrics: {},
  mindvault_update_metadata: { resourceId: "res-001", metadata: "ipfs://Qm123" },
  mindvault_set_price: { resourceId: "res-001", price: "10.00" },
  mindvault_transfer_ownership: {
    resourceId: "res-001",
    newCreator: "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH",
  },
  mindvault_set_listed: { resourceId: "res-001", listed: true },
  mindvault_set_tags: { resourceId: "res-001", tags: ["dataset"] },
  mindvault_check_state_permissions: {},
  mindvault_registry_health: {},
  mindvault_import_wallet: {},
  mindvault_rotate_publisher_key: {},
  mindvault_verify_install: {},
  mindvault_recover_catalog_cache: {},
};

function expectInvalid(tool: string, args: unknown): ToolValidationError {
  try {
    validateToolArgs(tool, args);
  } catch (err) {
    expect(err).toBeInstanceOf(ToolValidationError);
    return err as ToolValidationError;
  }
  throw new Error(`expected ${tool} to reject ${JSON.stringify(args)}`);
}

// ── 1. Structural: specs and advertised metadata cannot drift ────────────────

describe("spec coverage", () => {
  it("every advertised tool has a validation spec", () => {
    for (const tool of specValidatedTools()) {
      expect(TOOL_ARGUMENT_SPECS, `${tool.name} has no validation spec`).toHaveProperty(tool.name);
    }
  });

  it("the self-validating exemption names exactly the tools without a spec", () => {
    // Keeps TOOLS_WITHOUT_ARG_VALIDATION honest in both directions: a tool that
    // gains a spec must leave the list, and a tool that loses one must not
    // silently join it.
    const withoutSpec = TOOL_DEFINITIONS.filter((tool) => !(tool.name in TOOL_ARGUMENT_SPECS)).map(
      (tool) => tool.name,
    );
    expect(withoutSpec.sort()).toEqual([...TOOLS_WITHOUT_ARG_VALIDATION].sort());
  });

  it("every validation spec belongs to an advertised tool", () => {
    const advertised = new Set(knownToolNames());
    for (const name of Object.keys(TOOL_ARGUMENT_SPECS)) {
      expect(advertised, `${name} is validated but not advertised`).toContain(name);
    }
  });

  it("spec arguments match the advertised inputSchema properties", () => {
    for (const tool of specValidatedTools()) {
      const spec = TOOL_ARGUMENT_SPECS[tool.name];
      expect(Object.keys(spec).sort(), `${tool.name} argument names`).toEqual(
        Object.keys(tool.inputSchema.properties).sort(),
      );
    }
  });

  it("required arguments match the advertised required list", () => {
    for (const tool of specValidatedTools()) {
      const spec = TOOL_ARGUMENT_SPECS[tool.name];
      const specRequired = Object.entries(spec)
        .filter(([, argSpec]) => argSpec.required)
        .map(([field]) => field)
        .sort();
      expect(specRequired, `${tool.name} required arguments`).toEqual(
        [...tool.inputSchema.required].sort(),
      );
    }
  });

  it("the fixture table covers every tool", () => {
    expect(Object.keys(VALID_CALLS).sort()).toEqual(Object.keys(TOOL_ARGUMENT_SPECS).sort());
  });
});

// ── 2. Per-tool: valid calls pass, bad calls fail deterministically ──────────

describe.each(Object.keys(TOOL_ARGUMENT_SPECS))("%s", (tool) => {
  const spec = TOOL_ARGUMENT_SPECS[tool];
  const requiredFields = Object.entries(spec)
    .filter(([, argSpec]) => argSpec.required)
    .map(([field]) => field);

  it("accepts its minimal valid arguments", () => {
    expect(() => validateToolArgs(tool, VALID_CALLS[tool])).not.toThrow();
  });

  it("accepts omitted arguments (undefined bag)", () => {
    if (requiredFields.length > 0) {
      const err = expectInvalid(tool, undefined);
      expect(err.issues.every((i) => i.code === "missing_required")).toBe(true);
    } else {
      expect(() => validateToolArgs(tool, undefined)).not.toThrow();
    }
  });

  it("rejects unknown arguments", () => {
    const err = expectInvalid(tool, { ...VALID_CALLS[tool], nope: "x" });
    expect(err.issues.some((i) => i.code === "unknown_argument" && i.field === "nope")).toBe(true);
    expect(err.message).toContain("not a recognized argument");
  });

  it("rejects a non-object argument bag", () => {
    const err = expectInvalid(tool, ["not", "an", "object"]);
    expect(err.issues[0].code).toBe("not_an_object");
    expect(err.message).toContain("must be a JSON object");
  });

  if (requiredFields.length > 0) {
    it.each(requiredFields)("reports %s as missing when omitted", (field) => {
      const args = { ...VALID_CALLS[tool] };
      delete args[field];
      const err = expectInvalid(tool, args);
      expect(err.issues.some((i) => i.field === field && i.code === "missing_required")).toBe(true);
    });

    it.each(requiredFields)("rejects a non-string %s", (field) => {
      const err = expectInvalid(tool, { ...VALID_CALLS[tool], [field]: 42 });
      expect(err.issues.some((i) => i.field === field)).toBe(true);
      // The rejected value is never echoed back into the message.
      expect(err.message).not.toContain("42");
    });
  }

  it("produces the same message for the same bad call", () => {
    const bad = { ...VALID_CALLS[tool], nope: "x" };
    expect(expectInvalid(tool, bad).message).toBe(expectInvalid(tool, bad).message);
  });
});

// ── 3. Semantics per argument kind ───────────────────────────────────────────

describe("unknown tools", () => {
  it("throws UnknownToolError naming the available tools", () => {
    try {
      validateToolArgs("mindvault_not_a_tool", {});
      throw new Error("expected a throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownToolError);
      expect((err as Error).message).toContain("Unknown tool: mindvault_not_a_tool");
      expect((err as Error).message).toContain("mindvault_browse");
    }
  });
});

describe("string arguments", () => {
  it("trims surrounding whitespace", () => {
    const args = validateToolArgs("mindvault_search", { query: "  stellar  " });
    expect(requiredString(args, "query")).toBe("stellar");
  });

  it("rejects an empty or whitespace-only required string", () => {
    expect(expectInvalid("mindvault_search", { query: "" }).issues[0].code).toBe("empty_string");
    expect(expectInvalid("mindvault_search", { query: "   " }).issues[0].code).toBe("empty_string");
  });

  it("enforces maxLength", () => {
    const err = expectInvalid("mindvault_search", { query: "x".repeat(257) });
    expect(err.issues[0].code).toBe("too_long");
    expect(err.message).toContain("at most 256 characters");
  });

  it("enforces minLength for passphrases", () => {
    const err = expectInvalid("mindvault_backup_state", { passphrase: "short" });
    expect(err.issues[0].code).toBe("too_short");
    expect(err.message).toContain("at least 8 characters");
    // The rejected passphrase must not appear in agent-facing output.
    expect(err.message).not.toContain("short");
  });

  it("rejects a resourceId that could alter the request path", () => {
    for (const bad of ["../secrets", "res 001", "res/001", "res?x=1"]) {
      expect(expectInvalid("mindvault_preview", { resourceId: bad }).issues[0].code).toBe(
        "pattern_mismatch",
      );
    }
  });

  it("rejects a malformed email and accepts a valid one", () => {
    const err = expectInvalid("mindvault_register", { name: "A", email: "not-an-email" });
    expect(err.issues[0].field).toBe("email");
    expect(err.issues[0].code).toBe("pattern_mismatch");
    expect(() =>
      validateToolArgs("mindvault_register", { name: "A", email: "a@b.co" }),
    ).not.toThrow();
  });

  it("rejects a non-Stellar wallet address", () => {
    const err = expectInvalid("mindvault_register", {
      name: "A",
      email: "a@b.co",
      walletAddress: "not-a-key",
    });
    expect(err.issues[0].field).toBe("walletAddress");
  });

  it("rejects a non-http externalUrl", () => {
    const err = expectInvalid("mindvault_publish", {
      title: "T",
      price: "1.00",
      externalUrl: "ftp://example.com/x",
    });
    expect(err.issues[0].field).toBe("externalUrl");
    expect(err.message).toContain("http(s) URL");
  });

  it("rejects a non-decimal price", () => {
    for (const price of ["free", "-1", "1.2.3", "1,50"]) {
      const err = expectInvalid("mindvault_publish", {
        title: "T",
        price,
        externalUrl: "https://example.com/x",
      });
      expect(err.issues[0].field).toBe("price");
    }
  });

  it("rejects an invalid profile name", () => {
    expect(expectInvalid("mindvault_use_profile", { name: "has space" }).issues[0].code).toBe(
      "pattern_mismatch",
    );
    expect(expectInvalid("mindvault_use_profile", { name: "x".repeat(65) }).issues[0].code).toBe(
      "too_long",
    );
  });
});

describe("enum arguments", () => {
  it("accepts every advertised literal", () => {
    for (const status of ["pending", "verified", "rejected", "skipped"]) {
      expect(() =>
        validateToolArgs("mindvault_search", { query: "x", verificationStatus: status }),
      ).not.toThrow();
    }
    for (const type of ["file", "link"]) {
      expect(() =>
        validateToolArgs("mindvault_search", { query: "x", resourceType: type }),
      ).not.toThrow();
    }
  });

  it("rejects a value outside the set and lists the alternatives", () => {
    const err = expectInvalid("mindvault_search", { query: "x", verificationStatus: "approved" });
    expect(err.issues[0].code).toBe("not_in_enum");
    expect(err.message).toContain("pending, verified, rejected, skipped");
  });
});

describe("flag arguments", () => {
  it("accepts booleans", () => {
    expect(flag(validateToolArgs("mindvault_reset", { all: true }), "all")).toBe(true);
    expect(flag(validateToolArgs("mindvault_reset", { all: false }), "all")).toBe(false);
  });

  it("accepts the common string and numeric spellings", () => {
    for (const value of ["true", "TRUE", " yes ", "1", "on", 1]) {
      expect(flag(validateToolArgs("mindvault_metrics", { reset: value }), "reset")).toBe(true);
    }
    for (const value of ["false", "no", "0", "off", 0]) {
      expect(flag(validateToolArgs("mindvault_metrics", { reset: value }), "reset")).toBe(false);
    }
  });

  it("defaults to false when omitted", () => {
    expect(flag(validateToolArgs("mindvault_metrics", {}), "reset")).toBe(false);
  });

  it("rejects ambiguous values", () => {
    const err = expectInvalid("mindvault_metrics", { reset: "maybe" });
    expect(err.issues[0].code).toBe("wrong_type");
    expect(err.message).toContain("boolean");
  });
});

describe("hash arguments", () => {
  it("normalizes txHash to bare lowercase hex", () => {
    const args = validateToolArgs("mindvault_tx_status", { txHash: VALID_SHA256.toUpperCase() });
    expect(requiredString(args, "txHash")).toBe(VALID_SHA256);
  });

  it("accepts a sha256:-prefixed txHash", () => {
    const args = validateToolArgs("mindvault_tx_status", { txHash: `sha256:${VALID_SHA256}` });
    expect(requiredString(args, "txHash")).toBe(VALID_SHA256);
  });

  it("normalizes expectedMetadataHash to canonical algorithm:hex form", () => {
    const args = validateToolArgs("mindvault_check_consistency", {
      resourceId: "res-001",
      expectedMetadataHash: VALID_SHA256,
    });
    expect(optionalString(args, "expectedMetadataHash")).toBe(`sha256:${VALID_SHA256}`);
  });

  it("rejects a digest of the wrong length", () => {
    const err = expectInvalid("mindvault_tx_status", { txHash: VALID_SHA256.slice(0, 63) });
    expect(err.issues[0].code).toBe("invalid_hash");
    expect(err.message).toContain("63 hex characters");
  });

  it("rejects non-hexadecimal characters", () => {
    const err = expectInvalid("mindvault_tx_status", { txHash: "z".repeat(64) });
    expect(err.issues[0].code).toBe("invalid_hash");
    expect(err.message).toContain("hexadecimal");
  });
});

describe("multi-issue reporting", () => {
  it("reports every problem in one deterministic error", () => {
    const err = expectInvalid("mindvault_publish", {
      title: "",
      price: "free",
      externalUrl: "nope",
      typo: 1,
    });
    const fields = err.issues.map((i) => i.field);
    expect(fields).toEqual(["typo", "title", "price", "externalUrl"]);
    expect(err.tool).toBe("mindvault_publish");
    expect(err.message.startsWith("Invalid arguments for mindvault_publish:")).toBe(true);
  });
});

describe("normalized output", () => {
  it("returns only validated fields", () => {
    const args = validateToolArgs("mindvault_publish", {
      title: " Dataset ",
      price: "5.00",
      externalUrl: "https://example.com/data.json",
    });
    expect(args).toEqual({
      title: "Dataset",
      price: "5.00",
      externalUrl: "https://example.com/data.json",
    });
    expect(optionalString(args, "description")).toBeUndefined();
  });
});

// ── Catalog filters: the browse/search argument surface ─────────────────────

describe("catalog filter arguments", () => {
  it("accepts every sort value on browse and on search", () => {
    for (const sort of ["newest", "price_asc", "price_desc", "title"]) {
      expect(() => validateToolArgs("mindvault_browse", { sort })).not.toThrow();
      expect(() => validateToolArgs("mindvault_search", { query: "x", sort })).not.toThrow();
    }
  });

  it("rejects an unknown sort value", () => {
    const err = expectInvalid("mindvault_browse", { sort: "cheapest" });
    expect(err.issues[0].code).toBe("not_in_enum");
  });

  it("accepts the whole advertised filter set on browse", () => {
    expect(() =>
      validateToolArgs("mindvault_browse", {
        query: "stellar",
        minPrice: "0.10",
        maxPrice: "5.00",
        verificationStatus: "verified",
        resourceType: "link",
        owner: "Alice",
        sort: "price_asc",
        limit: 20,
        offset: 0,
        tags: "dataset,research",
        listed: true,
      }),
    ).not.toThrow();
  });

  it("still reports a typo rather than silently ignoring it", () => {
    const err = expectInvalid("mindvault_browse", { sortBy: "price" });
    expect(err.issues[0].code).toBe("unknown_argument");
    expect(err.issues[0].message).toContain("sort");
  });

  it("browse and search validate against the same argument names", () => {
    expect(Object.keys(TOOL_ARGUMENT_SPECS.mindvault_browse).sort()).toEqual(
      Object.keys(TOOL_ARGUMENT_SPECS.mindvault_search).sort(),
    );
  });
});

describe("mindvault_export_receipts arguments", () => {
  it("accepts the documented filters", () => {
    expect(() =>
      validateToolArgs("mindvault_export_receipts", {
        format: "csv",
        resourceId: "res-001",
        network: "stellar:testnet",
        since: "2026-08-01",
        until: "2026-08-31",
        limit: 50,
      }),
    ).not.toThrow();
  });

  it("rejects a format it cannot produce", () => {
    const err = expectInvalid("mindvault_export_receipts", { format: "xml" });
    expect(err.issues[0].code).toBe("not_in_enum");
  });

  it("rejects a limit outside the supported range", () => {
    expect(expectInvalid("mindvault_export_receipts", { limit: 0 }).issues).toHaveLength(1);
  });
});
