import type { ContractWriteDeps } from "./contractWrite";
import { createContractWriteTool } from "./contractWrite";
import type { ToolDefinition } from "../types";

export function createTools(deps: ContractWriteDeps): ToolDefinition[] {
  return [createContractWriteTool(deps)];
}

export { createContractWriteTool, runContractWrite, validateContractWriteArgs } from "./contractWrite";
