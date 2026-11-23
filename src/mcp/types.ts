export type ContractWriteMode = "execute" | "dry-run";

export interface ContractWriteArgs {
  chainId: number;
  contractAddress: string;
  functionName: string;
  args: unknown[];
  value?: string;
  mode?: ContractWriteMode;
}

export interface SimulationResult {
  status: "simulated";
  success: boolean;
  returnData?: unknown;
  error?: string;
  estimatedGas?: string;
}

export interface ConfirmedResult {
  status: "confirmed";
  transactionHash: string;
  blockNumber?: number;
}

export type ContractWriteResult = SimulationResult | ConfirmedResult;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

export interface WalletClient {
  signAndSend(tx: {
    chainId: number;
    to: string;
    data: string;
    value?: string;
  }): Promise<{ transactionHash: string; blockNumber?: number }>;
}

export interface ChainClient {
  simulateContract(params: {
    chainId: number;
    address: string;
    functionName: string;
    args: unknown[];
    value?: string;
  }): Promise<{ result?: unknown; estimatedGas?: string }>;
  encodeCall(params: {
    address: string;
    functionName: string;
    args: unknown[];
  }): string;
}
