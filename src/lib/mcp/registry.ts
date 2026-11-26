import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { GetPromptResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { McpAuthContext } from "@/lib/mcp/auth";
import { hasScope, type McpScope } from "@/lib/mcp/scopes";
import { isServiceError } from "@/lib/services/errors";

export interface McpCatalogSummary {
  modules: string[];
  tools: string[];
  resources: string[];
  prompts: string[];
}

export interface McpModuleContext {
  auth: McpAuthContext;
  origin: string;
  version: string;
  getCatalogSummary: () => McpCatalogSummary;
}

export interface McpToolSpec<TArgs extends object = Record<string, unknown>> {
  name: string;
  title: string;
  description: string;
  requiredScope: McpScope | null;
  accessMode: "read" | "write";
  annotations: ToolAnnotations;
  inputSchema?: ZodRawShapeCompat;
  handler(args: TArgs, ctx: McpModuleContext): Promise<unknown>;
}

export interface McpResourceSpec {
  name: string;
  uri: string;
  title: string;
  description: string;
  mimeType: string;
  requiredScope: McpScope;
  handler(ctx: McpModuleContext): Promise<unknown>;
}

export interface McpPromptSpec<
  TArgs extends Record<string, string | undefined> = Record<string, string | undefined>,
> {
  name: string;
  title: string;
  description: string;
  requiredScopes: readonly McpScope[];
  argsSchema?: ZodRawShapeCompat;
  handler(args: TArgs, ctx: McpModuleContext): Promise<GetPromptResult> | GetPromptResult;
}

export interface McpModule {
  id: string;
  tools: readonly McpToolSpec[];
  resources: readonly McpResourceSpec[];
  prompts: readonly McpPromptSpec[];
}

function formatToolError(code: string, status: number, message: string) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: code, status, message }, null, 2),
      },
    ],
  };
}

async function executeTool(
  spec: McpToolSpec,
  args: Record<string, unknown>,
  ctx: McpModuleContext
) {
  if (spec.requiredScope && !hasScope(ctx.auth.scopes, spec.requiredScope)) {
    return formatToolError(
      "insufficient_scope",
      403,
      `Missing required scope: ${spec.requiredScope}`
    );
  }

  try {
    const result = await spec.handler(args, ctx);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err: unknown) {
    if (isServiceError(err)) {
      return formatToolError(err.code, err.status, err.message);
    }
    const msg = err instanceof Error ? err.message : "Internal tool execution error";
    console.error(`MCP tool "${spec.name}" error:`, msg);
    return formatToolError("INTERNAL_ERROR", 500, "Tool execution failed");
  }
}

/**
 * Registers authorized tools, resources, and prompts from MCP modules onto a McpServer instance.
 */
export function registerModulesOnMcpServer(
  server: McpServer,
  modules: readonly McpModule[],
  baseCtx: Omit<McpModuleContext, "getCatalogSummary">
): McpCatalogSummary {
  const summary: McpCatalogSummary = {
    modules: [],
    tools: [],
    resources: [],
    prompts: [],
  };

  const ctx: McpModuleContext = {
    ...baseCtx,
    getCatalogSummary: () => summary,
  };

  for (const mod of modules) {
    let modHasActivePrimitive = false;

    for (const tool of mod.tools) {
      if (tool.requiredScope && !hasScope(baseCtx.auth.scopes, tool.requiredScope)) {
        continue;
      }

      modHasActivePrimitive = true;
      summary.tools.push(tool.name);

      if (tool.inputSchema) {
        server.registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
          },
          async (args) => executeTool(tool, args as Record<string, unknown>, ctx)
        );
      } else {
        server.registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            annotations: tool.annotations,
          },
          async () => executeTool(tool, {}, ctx)
        );
      }
    }

    for (const res of mod.resources) {
      if (!hasScope(baseCtx.auth.scopes, res.requiredScope)) {
        continue;
      }

      modHasActivePrimitive = true;
      summary.resources.push(res.uri);

      server.registerResource(
        res.name,
        res.uri,
        {
          title: res.title,
          description: res.description,
          mimeType: res.mimeType,
        },
        async (uri) => {
          if (!hasScope(baseCtx.auth.scopes, res.requiredScope)) {
            throw new Error(`insufficient_scope: ${res.requiredScope}`);
          }
          const data = await res.handler(ctx);
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: res.mimeType,
                text: JSON.stringify(data, null, 2),
              },
            ],
          };
        }
      );
    }

    for (const prompt of mod.prompts) {
      const allowed = prompt.requiredScopes.every((s) =>
        hasScope(baseCtx.auth.scopes, s)
      );
      if (!allowed) {
        continue;
      }

      modHasActivePrimitive = true;
      summary.prompts.push(prompt.name);

      if (prompt.argsSchema) {
        server.registerPrompt(
          prompt.name,
          {
            title: prompt.title,
            description: prompt.description,
            argsSchema: prompt.argsSchema,
          },
          async (args) =>
            prompt.handler(args as Record<string, string | undefined>, ctx)
        );
      } else {
        server.registerPrompt(
          prompt.name,
          {
            title: prompt.title,
            description: prompt.description,
          },
          async () => prompt.handler({}, ctx)
        );
      }
    }

    if (modHasActivePrimitive) {
      summary.modules.push(mod.id);
    }
  }

  return summary;
}
