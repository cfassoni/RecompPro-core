import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { GetPromptResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { McpAuthContext } from "@/lib/mcp/auth";
import { recordMcpAuditLog } from "@/lib/mcp/audit";
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
  const startedAt = Date.now();

  if (spec.requiredScope && !hasScope(ctx.auth.scopes, spec.requiredScope)) {
    await recordMcpAuditLog({
      userId: ctx.auth.userId,
      authMethod: ctx.auth.authMethod,
      clientLabel: ctx.auth.clientLabel,
      primitiveType: "tool",
      primitiveName: spec.name,
      accessMode: spec.accessMode,
      status: "denied",
      errorCode: "INSUFFICIENT_SCOPE",
      durationMs: Date.now() - startedAt,
    });
    return formatToolError(
      "insufficient_scope",
      403,
      `Missing required scope: ${spec.requiredScope}`
    );
  }

  try {
    const result = await spec.handler(args, ctx);
    await recordMcpAuditLog({
      userId: ctx.auth.userId,
      authMethod: ctx.auth.authMethod,
      clientLabel: ctx.auth.clientLabel,
      primitiveType: "tool",
      primitiveName: spec.name,
      accessMode: spec.accessMode,
      status: "success",
      durationMs: Date.now() - startedAt,
    });
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
      await recordMcpAuditLog({
        userId: ctx.auth.userId,
        authMethod: ctx.auth.authMethod,
        clientLabel: ctx.auth.clientLabel,
        primitiveType: "tool",
        primitiveName: spec.name,
        accessMode: spec.accessMode,
        status: "error",
        errorCode: err.code,
        durationMs: Date.now() - startedAt,
      });
      return formatToolError(err.code, err.status, err.message);
    }
    const msg = err instanceof Error ? err.message : "Internal tool execution error";
    console.error(`MCP tool "${spec.name}" error:`, msg);
    await recordMcpAuditLog({
      userId: ctx.auth.userId,
      authMethod: ctx.auth.authMethod,
      clientLabel: ctx.auth.clientLabel,
      primitiveType: "tool",
      primitiveName: spec.name,
      accessMode: spec.accessMode,
      status: "error",
      errorCode: "INTERNAL_ERROR",
      durationMs: Date.now() - startedAt,
    });
    return formatToolError("INTERNAL_ERROR", 500, "Tool execution failed");
  }
}

/**
 * Inspects an incoming JSON-RPC payload (single or batch) and records `"denied"` audit entries
 * whenever the authenticated caller attempts to invoke a known primitive without its required scope.
 */
export async function recordDeniedOutOfScopeCalls(
  rpcBody: unknown,
  auth: McpAuthContext,
  modules: readonly McpModule[]
): Promise<void> {
  const items = Array.isArray(rpcBody) ? rpcBody : [rpcBody];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const req = item as { method?: unknown; params?: unknown };
    const method = req.method;
    const params = (req.params && typeof req.params === "object"
      ? req.params
      : {}) as Record<string, unknown>;

    if (method === "tools/call" && typeof params.name === "string") {
      const tool = modules.flatMap((m) => m.tools).find((t) => t.name === params.name);
      if (tool && tool.requiredScope && !hasScope(auth.scopes, tool.requiredScope)) {
        await recordMcpAuditLog({
          userId: auth.userId,
          authMethod: auth.authMethod,
          clientLabel: auth.clientLabel,
          primitiveType: "tool",
          primitiveName: tool.name,
          accessMode: tool.accessMode,
          status: "denied",
          errorCode: "INSUFFICIENT_SCOPE",
          durationMs: 0,
        });
      }
    } else if (method === "resources/read" && typeof params.uri === "string") {
      const res = modules.flatMap((m) => m.resources).find((r) => r.uri === params.uri);
      if (res && !hasScope(auth.scopes, res.requiredScope)) {
        await recordMcpAuditLog({
          userId: auth.userId,
          authMethod: auth.authMethod,
          clientLabel: auth.clientLabel,
          primitiveType: "resource",
          primitiveName: res.uri,
          accessMode: "read",
          status: "denied",
          errorCode: "INSUFFICIENT_SCOPE",
          durationMs: 0,
        });
      }
    } else if (method === "prompts/get" && typeof params.name === "string") {
      const prompt = modules.flatMap((m) => m.prompts).find((p) => p.name === params.name);
      if (prompt && !prompt.requiredScopes.every((s) => hasScope(auth.scopes, s))) {
        await recordMcpAuditLog({
          userId: auth.userId,
          authMethod: auth.authMethod,
          clientLabel: auth.clientLabel,
          primitiveType: "prompt",
          primitiveName: prompt.name,
          accessMode: "read",
          status: "denied",
          errorCode: "INSUFFICIENT_SCOPE",
          durationMs: 0,
        });
      }
    }
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
          const startedAt = Date.now();
          if (!hasScope(baseCtx.auth.scopes, res.requiredScope)) {
            await recordMcpAuditLog({
              userId: baseCtx.auth.userId,
              authMethod: baseCtx.auth.authMethod,
              clientLabel: baseCtx.auth.clientLabel,
              primitiveType: "resource",
              primitiveName: res.uri,
              accessMode: "read",
              status: "denied",
              errorCode: "INSUFFICIENT_SCOPE",
              durationMs: Date.now() - startedAt,
            });
            throw new Error(`insufficient_scope: ${res.requiredScope}`);
          }
          try {
            const data = await res.handler(ctx);
            await recordMcpAuditLog({
              userId: baseCtx.auth.userId,
              authMethod: baseCtx.auth.authMethod,
              clientLabel: baseCtx.auth.clientLabel,
              primitiveType: "resource",
              primitiveName: res.uri,
              accessMode: "read",
              status: "success",
              durationMs: Date.now() - startedAt,
            });
            return {
              contents: [
                {
                  uri: uri.href,
                  mimeType: res.mimeType,
                  text: JSON.stringify(data, null, 2),
                },
              ],
            };
          } catch (err: unknown) {
            await recordMcpAuditLog({
              userId: baseCtx.auth.userId,
              authMethod: baseCtx.auth.authMethod,
              clientLabel: baseCtx.auth.clientLabel,
              primitiveType: "resource",
              primitiveName: res.uri,
              accessMode: "read",
              status: "error",
              errorCode: isServiceError(err) ? err.code : "INTERNAL_ERROR",
              durationMs: Date.now() - startedAt,
            });
            throw err;
          }
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

      const invokePrompt = async (args: Record<string, string | undefined>) => {
        const startedAt = Date.now();
        try {
          const result = await prompt.handler(args, ctx);
          await recordMcpAuditLog({
            userId: baseCtx.auth.userId,
            authMethod: baseCtx.auth.authMethod,
            clientLabel: baseCtx.auth.clientLabel,
            primitiveType: "prompt",
            primitiveName: prompt.name,
            accessMode: "read",
            status: "success",
            durationMs: Date.now() - startedAt,
          });
          return result;
        } catch (err: unknown) {
          await recordMcpAuditLog({
            userId: baseCtx.auth.userId,
            authMethod: baseCtx.auth.authMethod,
            clientLabel: baseCtx.auth.clientLabel,
            primitiveType: "prompt",
            primitiveName: prompt.name,
            accessMode: "read",
            status: "error",
            errorCode: isServiceError(err) ? err.code : "INTERNAL_ERROR",
            durationMs: Date.now() - startedAt,
          });
          throw err;
        }
      };

      if (prompt.argsSchema) {
        server.registerPrompt(
          prompt.name,
          {
            title: prompt.title,
            description: prompt.description,
            argsSchema: prompt.argsSchema,
          },
          async (args) => invokePrompt(args as Record<string, string | undefined>)
        );
      } else {
        server.registerPrompt(
          prompt.name,
          {
            title: prompt.title,
            description: prompt.description,
          },
          async () => invokePrompt({})
        );
      }
    }

    if (modHasActivePrimitive) {
      summary.modules.push(mod.id);
    }
  }

  return summary;
}
