import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet, apiPost } from "./client.js";
import { endpoints } from "./endpoints.generated.js";
import type { JsonSchema } from "./endpoint-types.js";

function toResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

async function runTool(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return toResult(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: message }],
      isError: true,
    };
  }
}

function toZod(schema: JsonSchema): z.ZodTypeAny {
  let out: z.ZodTypeAny;
  switch (schema.type) {
    case "string": {
      if (schema.enum && schema.enum.length > 0) {
        out = z.enum(schema.enum.map(String) as [string, ...string[]]);
      } else if (schema.format === "uuid") {
        out = z.string().uuid();
      } else if (schema.format === "email") {
        out = z.string().email();
      } else {
        out = z.string();
      }
      break;
    }
    case "integer":
    case "number": {
      let n = schema.type === "integer" ? z.number().int() : z.number();
      if (schema.minimum !== undefined) n = n.min(schema.minimum);
      if (schema.maximum !== undefined) n = n.max(schema.maximum);
      out = n;
      break;
    }
    case "boolean":
      out = z.boolean();
      break;
    case "array":
      out = z.array(schema.items ? toZod(schema.items) : z.any());
      break;
    case "object":
      out = z.object(toShape(schema));
      break;
    default:
      out = z.any();
  }
  if (schema.description) out = out.describe(schema.description);
  return out;
}

function toShape(schema: JsonSchema): Record<string, z.ZodTypeAny> {
  const required = new Set(schema.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const field = toZod(prop);
    shape[key] = required.has(key) ? field : field.optional();
  }
  return shape;
}

/**
 * Registers one MCP tool per NeuralVerge API endpoint. The endpoint list is generated from
 * the official OpenAPI spec (docs.neuralverge.ai/openapi.json) by scripts/generate-endpoints.mjs.
 */
export function registerTools(server: McpServer) {
  for (const endpoint of endpoints) {
    server.tool(endpoint.name, endpoint.description, toShape(endpoint.schema), async (args) =>
      runTool(() =>
        endpoint.method === "GET"
          ? apiGet(
              endpoint.path,
              Object.fromEntries(
                Object.entries(args as Record<string, unknown>)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => [k, String(v)]),
              ),
            )
          : apiPost(endpoint.path, args),
      ),
    );
  }
}
