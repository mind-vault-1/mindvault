import type {
  ChainClient,
  ContractWriteArgs,
  ContractWriteResult,
  ToolDefinition,
  WalletClient,
} from "../types";

export interface ContractWriteDeps {
  chain: ChainClient;
  wallet: WalletClient;
}

export function validateContractWriteArgs(input: unknown): ContractWriteArgs {
  if (typeof input !== "object" || input === null) {
    throw new Error("arguments must be an object");
  }
  const a = input as Record<string, unknown>;
  if (typeof a.chainId !== "number" || !Number.isInteger(a.chainId)) {
    throw new Error("chainId must be an integer");
  }
  if (typeof a.contractAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(a.contractAddress)) {
    throw new Error("contractAddress must be a 0x-prefixed 20-byte address");
  }
  if (typeof a.functionName !== "string" || a.functionName.length === 0) {
    throw new Error("functionName must be a non-empty string");
  }
  if (!Array.isArray(a.args)) {
    throw new Error("args must be an array");
  }
  if (a.value !== undefined && typeof a.value !== "string") {
    throw new Error("value must be a string when provided");
  }
  if (a.mode !== undefined && a.mode !== "execute" && a.mode !== "dry-run") {
    throw new Error("mode must be 'execute' or 'dry-run'");
  }
  return {
    chainId: a.chainId,
    contractAddress: a.contractAddress,
    functionName: a.functionName,
    args: a.args,
    value: a.value as string | undefined,
    mode: (a.mode as ContractWriteArgs["mode"]) ?? "execute",
  };
}

/**
 * Executes a contract write. In "dry-run" mode the wallet is never invoked,
 * so no signature is produced and no transaction is submitted.
 */
export async function runContractWrite(
  input: unknown,
  deps: ContractWriteDeps,
): Promise<ContractWriteResult> {
  const args = validateContractWriteArgs(input);

  const sim = await deps.chain.simulateContract({
    chainId: args.chainId,
    address: args.contractAddress,
    functionName: args.functionName,
    args: args.args,
    value: args.value,
  }).then(
    (r) => ({ ok: true as const, data: r }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );

  if (args.mode === "dry-run") {
    if (!sim.ok) {
      return { status: "simulated", success: false, error: sim.error };
    }
    return {
      status: "simulated",
      success: true,
      returnData: sim.data.result,
      estimatedGas: sim.data.estimatedGas,
    };
  }

  if (!sim.ok) {
    throw new Error(`simulation failed, transaction not submitted: ${sim.error}`);
  }

  const data = deps.chain.encodeCall({
    address: args.contractAddress,
    functionName: args.functionName,
    args: args.args,
  });
  const receipt = await deps.wallet.signAndSend({
    chainId: args.chainId,
    to: args.contractAddress,
    data,
    value: args.value,
  });
  return {
    status: "confirmed",
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
  };
}

export function createContractWriteTool(deps: ContractWriteDeps): ToolDefinition {
  return {
    name: "contract_write",
    description:
      "Write to a smart contract. Set mode to 'dry-run' to simulate without signing or submitting.",
    inputSchema: {
      type: "object",
      properties: {
        chainId: { type: "integer" },
        contractAddress: { type: "string" },
        functionName: { type: "string" },
        args: { type: "array" },
        value: { type: "string" },
        mode: { type: "string", enum: ["execute", "dry-run"], default: "execute" },
      },
      required: ["chainId", "contractAddress", "functionName", "args"],
    },
    handler: (args) => runContractWrite(args, deps),
  };
}
