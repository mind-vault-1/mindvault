import { describe, expect, it } from "vitest";

import {
  assertDestructiveOperationConfirmed,
  destructiveOperationToolNames,
  resolveDestructiveConfirmationPolicy,
  requiresDestructiveConfirmation,
} from "./destructiveOperations.js";

describe("destructiveOperations", () => {
  it("classifies local overwrite and irreversible chain tools", () => {
    expect(destructiveOperationToolNames()).toEqual([
      "mindvault_freeze",
      "mindvault_import_wallet",
      "mindvault_register",
      "mindvault_repair_sponsored_account",
      "mindvault_reset",
      "mindvault_restore_state",
      "mindvault_rotate_publisher_key",
      "mindvault_setup_wallet",
    ]);
  });

  it("defaults to off and rejects invalid policies", () => {
    expect(resolveDestructiveConfirmationPolicy({})).toBe("off");
    expect(() =>
      resolveDestructiveConfirmationPolicy({ MINDVAULT_CONFIRM_DESTRUCTIVE_OPERATIONS: "true" }),
    ).toThrow(/must be one of: off, local, chain, all/);
  });

  it("gates only the selected class", () => {
    expect(requiresDestructiveConfirmation("mindvault_reset", "local")).toBe(true);
    expect(requiresDestructiveConfirmation("mindvault_freeze", "local")).toBe(false);
    expect(requiresDestructiveConfirmation("mindvault_freeze", "chain")).toBe(true);
    expect(requiresDestructiveConfirmation("mindvault_reset", "chain")).toBe(false);
    expect(requiresDestructiveConfirmation("mindvault_reset", "all")).toBe(true);
    expect(requiresDestructiveConfirmation("mindvault_browse", "all")).toBe(false);
  });

  it("requires confirmDestructive only when the policy applies", () => {
    const env = { MINDVAULT_CONFIRM_DESTRUCTIVE_OPERATIONS: "all" };

    expect(() =>
      assertDestructiveOperationConfirmed({ toolName: "mindvault_reset", args: {}, env }),
    ).toThrow(/confirmDestructive: true/);
    expect(() =>
      assertDestructiveOperationConfirmed({
        toolName: "mindvault_reset",
        args: { confirmDestructive: true },
        env,
      }),
    ).not.toThrow();
    expect(() =>
      assertDestructiveOperationConfirmed({ toolName: "mindvault_browse", args: {}, env }),
    ).not.toThrow();
  });
});
