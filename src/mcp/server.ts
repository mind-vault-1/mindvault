import type { ToolDefinition } from "./types";
import type { ContractWriteDeps } from "./tools/contractWrite";
import { createTools } from "./tools";

export interface McpServer {
  listTools(): Array<Pick<ToolDefinition, "name" | "description" | "inputSchema">>;
  callTool(name: string, args: unknown): Promise<unknown>;
}

export function createMcpServer(deps: ContractWriteDeps): McpServer {
  const tools = new Map<string, ToolDefinition>();
  for (const tool of createTools(deps)) {
    tools.set(tool.name, tool);
  }
  return {
    listTools() {
      return [...tools.values()].map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      }));
    },
    async callTool(name, args) {
      const tool = tools.get(name);
      if (!tool) {
        throw new Error(`unknown tool: ${name}`);
      }
      return tool.handler(args);
    },
  };
}
