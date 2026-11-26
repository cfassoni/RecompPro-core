import { isReadOnlyScopes } from "@/lib/mcp/scopes";
import type { McpModule } from "@/lib/mcp/registry";

export const systemModule: McpModule = {
  id: "system",
  tools: [
    {
      name: "about",
      title: "About Recomp Pro MCP",
      description:
        "Returns Recomp Pro server metadata, authenticated user context, granted scopes, and enabled capabilities.",
      requiredScope: null,
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (_args, ctx) => {
        const catalog = ctx.getCatalogSummary();
        return {
          name: "recomp-pro",
          title: "Recomp Pro",
          version: ctx.version,
          websiteUrl: ctx.origin,
          user: {
            id: ctx.auth.userId,
            email: ctx.auth.userEmail,
          },
          auth: {
            method: ctx.auth.authMethod,
            client: ctx.auth.clientLabel,
            readOnly: isReadOnlyScopes(ctx.auth.scopes),
            scopes: ctx.auth.scopes,
          },
          capabilities: {
            phase: 3,
            modules: catalog.modules,
            tools: catalog.tools,
            resources: catalog.resources,
            prompts: catalog.prompts,
          },
        };
      },
    },
  ],
  resources: [],
  prompts: [],
};
